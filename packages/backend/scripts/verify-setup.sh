#!/bin/bash

# WorkTime Backend Setup Verification Script
# This script checks if all components are properly set up

set -e

echo "🔍 WorkTime Backend Setup Verification"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_pass() {
    echo -e "${GREEN}✅ $1${NC}"
}

check_fail() {
    echo -e "${RED}❌ $1${NC}"
}

check_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Navigate to backend directory
cd "$(dirname "$0")/.."

echo "1. Checking directory structure..."
if [ -d "src" ] && [ -d "src/routes" ] && [ -d "src/middleware" ] && [ -d "src/utils" ] && [ -d "src/db" ]; then
    check_pass "Directory structure exists"
else
    check_fail "Missing required directories"
    exit 1
fi

echo ""
echo "2. Checking configuration files..."
FILES=("package.json" "tsconfig.json" "wrangler.toml" "schema.sql")
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$file exists"
    else
        check_fail "$file missing"
        exit 1
    fi
done

echo ""
echo "3. Checking source files..."
SRC_FILES=(
    "src/index.ts"
    "src/types.ts"
    "src/routes/auth.ts"
    "src/routes/sessions.ts"
    "src/routes/stats.ts"
    "src/middleware/auth.ts"
    "src/middleware/validation.ts"
    "src/db/queries.ts"
    "src/utils/jwt.ts"
    "src/utils/errors.ts"
)

for file in "${SRC_FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$file exists"
    else
        check_fail "$file missing"
        exit 1
    fi
done

echo ""
echo "4. Checking dependencies..."
if [ -d "node_modules" ]; then
    check_pass "node_modules exists"

    # Check key dependencies
    if [ -d "node_modules/hono" ]; then
        check_pass "hono installed"
    else
        check_warn "hono not found - run: pnpm install"
    fi

    if [ -d "node_modules/zod" ]; then
        check_pass "zod installed"
    else
        check_warn "zod not found - run: pnpm install"
    fi

    if [ -d "node_modules/@hono/zod-validator" ]; then
        check_pass "@hono/zod-validator installed"
    else
        check_warn "@hono/zod-validator not found - run: pnpm install"
    fi
else
    check_warn "node_modules not found - run: pnpm install"
fi

echo ""
echo "5. Checking TypeScript compilation..."
if command -v tsc &> /dev/null; then
    if pnpm typecheck &> /dev/null; then
        check_pass "TypeScript compiles without errors"
    else
        check_warn "TypeScript compilation has errors"
    fi
else
    check_warn "TypeScript not installed"
fi

echo ""
echo "6. Checking wrangler configuration..."
if grep -q "YOUR_DATABASE_ID" wrangler.toml 2>/dev/null; then
    check_warn "D1 database ID not configured (run: pnpm d1:create)"
else
    check_pass "D1 database ID configured"
fi

if grep -q "YOUR_KV_ID" wrangler.toml 2>/dev/null; then
    check_warn "KV namespace ID not configured (run: pnpm kv:create)"
else
    check_pass "KV namespace ID configured"
fi

echo ""
echo "7. Checking environment variables..."
if [ -f ".dev.vars" ]; then
    check_pass ".dev.vars file exists"

    if grep -q "JWT_SECRET" .dev.vars 2>/dev/null; then
        check_pass "JWT_SECRET configured"
    else
        check_warn "JWT_SECRET not found in .dev.vars"
    fi

    if grep -q "GITHUB_CLIENT_ID" .dev.vars 2>/dev/null; then
        check_pass "GITHUB_CLIENT_ID configured"
    else
        check_warn "GITHUB_CLIENT_ID not found in .dev.vars"
    fi

    if grep -q "GITHUB_CLIENT_SECRET" .dev.vars 2>/dev/null; then
        check_pass "GITHUB_CLIENT_SECRET configured"
    else
        check_warn "GITHUB_CLIENT_SECRET not found in .dev.vars"
    fi
else
    check_warn ".dev.vars not found (copy from .env.example)"
fi

echo ""
echo "8. Code quality checks..."

# Check for TODO comments
TODO_COUNT=$(grep -r "TODO" src/ 2>/dev/null | wc -l | tr -d ' ')
if [ "$TODO_COUNT" -eq "0" ]; then
    check_pass "No TODO comments found"
else
    check_warn "Found $TODO_COUNT TODO comments"
fi

# Check file sizes (warn if any file > 500 lines)
for file in "${SRC_FILES[@]}"; do
    if [ -f "$file" ]; then
        LINES=$(wc -l < "$file" | tr -d ' ')
        if [ "$LINES" -gt 500 ]; then
            check_warn "$file has $LINES lines (consider splitting)"
        fi
    fi
done

echo ""
echo "======================================"
echo "Verification Summary"
echo "======================================"
echo ""

# Count checks
TOTAL_CHECKS=0
PASSED_CHECKS=0

if [ -d "src/routes" ]; then ((PASSED_CHECKS++)); fi
((TOTAL_CHECKS++))

if [ -f "package.json" ]; then ((PASSED_CHECKS++)); fi
((TOTAL_CHECKS++))

if [ -f "src/index.ts" ]; then ((PASSED_CHECKS++)); fi
((TOTAL_CHECKS++))

if [ -d "node_modules/hono" ]; then ((PASSED_CHECKS++)); fi
((TOTAL_CHECKS++))

echo "Passed: $PASSED_CHECKS/$TOTAL_CHECKS core checks"
echo ""

echo "Next steps:"
echo "1. Install dependencies: pnpm install"
echo "2. Create D1 database: pnpm d1:create"
echo "3. Create KV namespace: pnpm kv:create"
echo "4. Run migrations: pnpm d1:migrate:local"
echo "5. Configure .dev.vars: cp .env.example .dev.vars"
echo "6. Start dev server: pnpm dev"
echo "7. Test health endpoint: curl http://localhost:8787/health"
echo ""

check_pass "Setup verification complete!"
