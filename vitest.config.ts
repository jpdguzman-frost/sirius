import { configDefaults, defineConfig } from 'vitest/config';

/* Agent worktrees (Workflow `isolation: 'worktree'`) are checked out under
   .claude/worktrees/ INSIDE the repo. Vitest's default exclude does not know
   the folder, so a bare `vitest run test/x.test.ts` also collected every
   worktree's copy of that suite — and a worktree pinned at an older commit
   reported reds that were not ours (block 5 proofs, 2026-09-06). */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
});
