/**
 * Admin panel routes (T088; FR-10) — the allow-list managed from a screen.
 * Every route: session + ensureAdmin, server-side (FR-10.5). No hard deletes
 * (FR-10.8); the last active admin cannot be deactivated (FR-10.6); every
 * action writes audit_log (FR-10.7; invariant 10).
 *
 * The frontend learns whether to show the tab from /api/me (projects.ts),
 * which now carries the admin flag.
 */

import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { ensureAuthenticated, type SessionUser } from '../auth/session.ts';
import { ensureAdmin } from '../auth/admin.ts';
import { audit } from '../services/audit.ts';
import { Project, User, UserProject } from '../models/index.ts';

const FROST_EMAIL = /^[a-z0-9._%+-]+@frostdesigngroup\.com$/i;

export function adminRouter(): Router {
  const router = Router();

  router.get('/api/admin/users', ensureAuthenticated, ensureAdmin, async (_req, res) => {
    const [users, memberships, projects] = await Promise.all([
      User.find().sort({ email: 1 }),
      UserProject.find(),
      Project.find().select('code name'),
    ]);
    const byUser = new Map<string, string[]>();
    for (const m of memberships) {
      const key = String(m.user_id);
      if (!byUser.has(key)) byUser.set(key, []);
      byUser.get(key)!.push(String(m.project_id));
    }
    res.json({
      ok: true,
      users: users.map((u) => ({
        id: String(u._id),
        email: u.email,
        name: u.name ?? null,
        active: u.active,
        admin: u.is_admin,
        lastLoginAt: u.last_login_at ?? null,
        projectIds: byUser.get(String(u._id)) ?? [],
      })),
      projects: projects.map((p) => ({ id: String(p._id), code: p.code, name: p.name })),
    });
  });

  router.post('/api/admin/users', ensureAuthenticated, ensureAdmin, async (req, res) => {
    const body = z
      .object({ email: z.string().trim().toLowerCase(), name: z.string().trim().optional(), projectIds: z.array(z.string()).default([]) })
      .strict()
      .safeParse(req.body);
    if (!body.success || !FROST_EMAIL.test(body.data.email)) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_BODY', message: 'A @frostdesigngroup.com address is required.' } });
      return;
    }
    if (await User.findOne({ email: body.data.email })) {
      res.status(409).json({ ok: false, error: { code: 'EXISTS', message: 'That account is already on the list.' } });
      return;
    }
    const projectIds = body.data.projectIds.filter((id) => Types.ObjectId.isValid(id));
    const projects = await Project.find({ _id: { $in: projectIds } });
    const user = await User.create({ email: body.data.email, name: body.data.name });
    for (const p of projects) {
      await UserProject.create({ user_id: user._id, project_id: p._id });
    }
    const actor = (req.user as SessionUser).email;
    await audit({ actor, action: 'user.added', entity: 'user', entity_id: user.email, before: null, after: { email: user.email, name: user.name ?? null, projects: projects.map((p) => p.code) } });
    res.status(201).json({ ok: true, id: String(user._id) });
  });

  router.patch('/api/admin/users/:userId', ensureAuthenticated, ensureAdmin, async (req, res) => {
    const body = z.object({ active: z.boolean() }).strict().safeParse(req.body);
    const userId = String(req.params.userId);
    if (!body.success || !Types.ObjectId.isValid(userId)) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
      return;
    }
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
      return;
    }
    if (!body.data.active && user.is_admin && user.active) {
      const otherAdmins = await User.countDocuments({ _id: { $ne: user._id }, is_admin: true, active: true });
      if (otherAdmins === 0) {
        res.status(409).json({ ok: false, error: { code: 'LAST_ADMIN', message: 'The last active admin cannot be deactivated.' } });
        return;
      }
    }
    const before = user.active;
    user.active = body.data.active;
    await user.save();
    const actor = (req.user as SessionUser).email;
    await audit({ actor, action: body.data.active ? 'user.reactivated' : 'user.deactivated', entity: 'user', entity_id: user.email, before: { active: before }, after: { active: user.active } });
    res.json({ ok: true, active: user.active });
  });

  router.put('/api/admin/users/:userId/memberships', ensureAuthenticated, ensureAdmin, async (req, res) => {
    const body = z.object({ projectIds: z.array(z.string()) }).strict().safeParse(req.body);
    const userId = String(req.params.userId);
    if (!body.success || !Types.ObjectId.isValid(userId)) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_BODY' } });
      return;
    }
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ ok: false, error: { code: 'NOT_FOUND' } });
      return;
    }
    const wanted = body.data.projectIds.filter((id) => Types.ObjectId.isValid(id));
    const projects = await Project.find({ _id: { $in: wanted } });
    const beforeDocs = await UserProject.find({ user_id: user._id });
    const beforeIds = beforeDocs.map((m) => String(m.project_id)).sort();
    const afterIds = projects.map((p) => String(p._id)).sort();
    if (beforeIds.join(',') !== afterIds.join(',')) {
      await UserProject.deleteMany({ user_id: user._id });
      for (const p of projects) {
        await UserProject.create({ user_id: user._id, project_id: p._id });
      }
      const actor = (req.user as SessionUser).email;
      const beforeProjects = (await Project.find({ _id: { $in: beforeIds } })).map((p) => p.code);
      await audit({ actor, action: 'memberships.set', entity: 'user', entity_id: user.email, before: { projects: beforeProjects }, after: { projects: projects.map((p) => p.code) } });
    }
    res.json({ ok: true, projectIds: afterIds });
  });

  return router;
}
