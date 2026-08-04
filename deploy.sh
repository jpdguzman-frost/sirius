#!/bin/bash

# Sirius Deployment Script — ARES pattern: nothing deploys unless the full
# suite is green locally; rsync only what the server needs; restart remotely.
#
# Host details live in deploy.local.sh (gitignored — invariant 15 spirit:
# infrastructure coordinates stay out of the repo). Copy the DEST_* block
# below into deploy.local.sh and fill it from the ARES deployment values.

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST_USER=""
DEST_HOST=""
DEST_PORT="22"
DEST_DIR=""
SSH_KEY="~/.ssh/id_rsa"
[ -f "${SRC_DIR}/deploy.local.sh" ] && source "${SRC_DIR}/deploy.local.sh"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'

echo -e "${BLUE}Sirius Deploy${NC}"

if [ -z "$DEST_HOST" ] || [ -z "$DEST_DIR" ]; then
  echo -e "${RED}DEST_HOST / DEST_DIR not set — fill the variables at the top of deploy.sh${NC}"
  exit 1
fi

cd "${SRC_DIR}" || exit 1

echo -e "${BLUE}Running tests...${NC}"
npm run test:run --silent || { echo -e "${RED}Tests failed — aborting deploy${NC}"; exit 1; }
npm run typecheck --silent || { echo -e "${RED}Typecheck failed — aborting deploy${NC}"; exit 1; }
echo -e "${GREEN}Tests OK${NC}"

echo -e "${BLUE}Building frontend...${NC}"
npm run build --silent || { echo -e "${RED}Build failed${NC}"; exit 1; }
echo -e "${GREEN}Build OK${NC}"

# Rsync only what the server needs to run. .env is NEVER synced — secrets are
# provisioned on the host (invariant 15).
rsync -az \
  -e "ssh -q -i ${SSH_KEY} -p ${DEST_PORT}" \
  --include='server.js' \
  --include='package.json' \
  --include='package-lock.json' \
  --include='tsconfig.json' \
  --include='src/' --include='src/**' \
  --include='lib/' --include='lib/**' \
  --include='worker/' --include='worker/**' \
  --include='public/' --include='public/**' \
  --include='scripts/' --include='scripts/**' \
  --exclude='*' \
  "${SRC_DIR}/" "${DEST_USER}@${DEST_HOST}:${DEST_DIR}/"

if [ $? -ne 0 ]; then echo -e "${RED}rsync failed${NC}"; exit 1; fi

echo -e "${BLUE}Installing deps + migrating + restarting on host...${NC}"
ssh -q -i "${SSH_KEY}" -p "${DEST_PORT}" "${DEST_USER}@${DEST_HOST}" \
  "source ~/.nvm/nvm.sh && cd ${DEST_DIR} && npm ci --omit=dev && npm run migrate && (pm2 restart sirius sirius-worker --update-env || (pm2 start npm --name sirius -- run start && pm2 start npm --name sirius-worker -- run worker))"

if [ $? -ne 0 ]; then echo -e "${RED}Remote install/restart failed${NC}"; exit 1; fi

echo -e "${GREEN}Deployed${NC}"
