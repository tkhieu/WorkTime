#!/bin/bash
# API Test Script for PR Review Activities
# Usage: ./activities-api-tests.sh <BASE_URL> <JWT_TOKEN>

BASE_URL=${1:-"http://localhost:8787"}
JWT_TOKEN=${2:-"your-jwt-token-here"}

echo "Testing PR Review Activities API"
echo "Base URL: $BASE_URL"
echo "=================================="

# Test 1: Create single activity
echo -e "\n1. POST /api/activities - Create single activity"
curl -X POST "$BASE_URL/api/activities" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "activity_type": "comment",
    "repo_owner": "facebook",
    "repo_name": "react",
    "pr_number": 12345,
    "session_id": 1,
    "metadata": {
      "duration_seconds": 120,
      "is_inline_comment": true
    }
  }' | jq .

# Test 2: Create batch activities
echo -e "\n2. POST /api/activities/batch - Create multiple activities"
curl -X POST "$BASE_URL/api/activities/batch" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "activities": [
      {
        "activity_type": "comment",
        "repo_owner": "microsoft",
        "repo_name": "vscode",
        "pr_number": 67890,
        "metadata": {"duration_seconds": 90}
      },
      {
        "activity_type": "approve",
        "repo_owner": "microsoft",
        "repo_name": "vscode",
        "pr_number": 67890,
        "metadata": {"duration_seconds": 30}
      }
    ]
  }' | jq .

# Test 3: Get all activities
echo -e "\n3. GET /api/activities - List all activities"
curl -X GET "$BASE_URL/api/activities?limit=10&offset=0" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .

# Test 4: Get activities filtered by type
echo -e "\n4. GET /api/activities?activity_type=comment - Filter by type"
curl -X GET "$BASE_URL/api/activities?activity_type=comment&limit=5" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .

# Test 5: Get activities filtered by repo
echo -e "\n5. GET /api/activities?repo_owner=facebook&repo_name=react - Filter by repo"
curl -X GET "$BASE_URL/api/activities?repo_owner=facebook&repo_name=react" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .

# Test 6: Get activities for specific PR
echo -e "\n6. GET /api/activities?pr_number=12345 - Filter by PR number"
curl -X GET "$BASE_URL/api/activities?pr_number=12345" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .

# Test 7: Get activity statistics
echo -e "\n7. GET /api/activities/stats?days=7 - Activity stats for 7 days"
curl -X GET "$BASE_URL/api/activities/stats?days=7" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .

# Test 8: Get 30-day statistics
echo -e "\n8. GET /api/activities/stats?days=30 - Activity stats for 30 days"
curl -X GET "$BASE_URL/api/activities/stats?days=30" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .

echo -e "\n=================================="
echo "All tests completed!"
