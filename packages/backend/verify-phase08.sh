#!/bin/bash

echo "==================================="
echo "Phase 08: Backend Setup Verification"
echo "==================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 exists"
        return 0
    else
        echo -e "${RED}✗${NC} $1 missing"
        return 1
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 directory exists"
        return 0
    else
        echo -e "${RED}✗${NC} $1 directory missing"
        return 1
    fi
}

echo "1. Checking Directory Structure:"
check_dir "src"
check_dir "migrations"
echo ""

echo "2. Checking Configuration Files:"
check_file "package.json"
check_file "wrangler.toml"
check_file "tsconfig.json"
check_file ".dev.vars"
check_file ".gitignore"
echo ""

echo "3. Checking Source Files:"
check_file "src/index.ts"
check_file "migrations/0001_initial_schema.sql"
echo ""

echo "4. Checking Dependencies:"
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules directory exists"
    if [ -f "node_modules/hono/package.json" ]; then
        echo -e "${GREEN}✓${NC} Hono.js installed"
    else
        echo -e "${RED}✗${NC} Hono.js not found"
    fi
    if [ -f "node_modules/wrangler/package.json" ]; then
        echo -e "${GREEN}✓${NC} Wrangler installed"
    else
        echo -e "${RED}✗${NC} Wrangler not found"
    fi
else
    echo -e "${RED}✗${NC} node_modules not found - run pnpm install"
fi
echo ""

echo "5. Checking Database Schema:"
if grep -q "CREATE TABLE users" migrations/0001_initial_schema.sql; then
    echo -e "${GREEN}✓${NC} users table defined"
fi
if grep -q "CREATE TABLE time_sessions" migrations/0001_initial_schema.sql; then
    echo -e "${GREEN}✓${NC} time_sessions table defined"
fi
if grep -q "CREATE TABLE daily_stats" migrations/0001_initial_schema.sql; then
    echo -e "${GREEN}✓${NC} daily_stats table defined"
fi
if grep -q "FOREIGN KEY" migrations/0001_initial_schema.sql; then
    echo -e "${GREEN}✓${NC} Foreign key constraints defined"
fi
if grep -q "CREATE INDEX" migrations/0001_initial_schema.sql; then
    echo -e "${GREEN}✓${NC} Indexes defined"
fi
echo ""

echo "6. Testing Health Endpoint:"
echo "   Starting dev server (this may take a moment)..."
timeout 15 pnpm dev > /tmp/wrangler-verify.log 2>&1 &
WRANGLER_PID=$!
sleep 10

if curl -s http://localhost:8787/health | grep -q "ok"; then
    echo -e "${GREEN}✓${NC} Health endpoint responds correctly"
    curl -s http://localhost:8787/health | jq '.'
else
    echo -e "${RED}✗${NC} Health endpoint not responding"
fi

kill $WRANGLER_PID 2>/dev/null || true
echo ""

echo "==================================="
echo "Phase 08 Verification Complete"
echo "==================================="
