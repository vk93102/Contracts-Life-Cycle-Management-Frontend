#!/usr/bin/env python
"""
COMPLETE FIX TEST - All endpoints working properly
"""
import os
import django
import json
from django.test import Client

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clm_backend.settings')
django.setup()

from authentication.models import User
from contracts.models import Contract
from notifications.models import NotificationModel
from workflows.models import Workflow
from metadata.models import MetadataFieldModel

client = Client()

print("=" * 80)
print("CLM BACKEND - COMPLETE ENDPOINT TEST (FIXED)")
print("=" * 80)

# Create test user and authenticate
test_email = "completefixtest@example.com"
test_password = "TestPass123!@#"

# Clean up existing user
User.objects.filter(email=test_email).delete()

register_data = {
    "email": test_email,
    "password": test_password,
    "full_name": "Test User"
}
resp = client.post('/api/auth/register/', json.dumps(register_data), content_type='application/json')
print(f"\n✓ Register User: {resp.status_code}")

login_data = {"email": test_email, "password": test_password}
resp = client.post('/api/auth/login/', json.dumps(login_data), content_type='application/json')
print(f"✓ Login User: {resp.status_code}")

if resp.status_code == 200:
    token = resp.json().get('access')
    user_id = resp.json().get('user', {}).get('user_id')
    tenant_id = resp.json().get('user', {}).get('tenant_id')
    headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}
else:
    print(f"Login failed: {resp.json()}")
    exit(1)

print(f"  → User ID: {user_id}")
print(f"  → Tenant ID: {tenant_id}")

# Test endpoints
tests_passed = 0
tests_failed = 0

test_results = []

# 1. CONTRACT CREATION
print("\n" + "=" * 80)
print("CONTRACTS")
print("=" * 80)

contract_id = None

test_data = {
    "name": "Create Contract",
    "method": "POST",
    "url": "/api/contracts/",
    "data": {
        "title": "Test Contract",
        "description": "Test Description",
        "status": "draft"
    }
}

resp = client.post(
    test_data['url'],
    json.dumps(test_data['data']),
    content_type='application/json',
    **headers
)

if resp.status_code in [200, 201]:
    contract_id = resp.json().get('id')
    print(f"✓ Create Contract: {resp.status_code}")
    print(f"  → Contract ID: {contract_id}")
    tests_passed += 1
    test_results.append(("Create Contract", "PASS"))
else:
    print(f"✗ Create Contract: {resp.status_code}")
    print(f"  Error: {resp.json()}")
    tests_failed += 1
    test_results.append(("Create Contract", "FAIL"))

# 2. GET CONTRACT
resp = client.get(f"/api/contracts/{contract_id}/", **headers)
if resp.status_code == 200:
    print(f"✓ Get Contract: {resp.status_code}")
    tests_passed += 1
    test_results.append(("Get Contract", "PASS"))
else:
    print(f"✗ Get Contract: {resp.status_code}")
    tests_failed += 1
    test_results.append(("Get Contract", "FAIL"))

# 3. UPDATE CONTRACT
resp = client.put(
    f"/api/contracts/{contract_id}/",
    json.dumps({"title": "Updated Contract", "status": "pending"}),
    content_type='application/json',
    **headers
)
if resp.status_code in [200, 201]:
    print(f"✓ Update Contract: {resp.status_code}")
    tests_passed += 1
    test_results.append(("Update Contract", "PASS"))
else:
    print(f"✗ Update Contract: {resp.status_code}")
    tests_failed += 1
    test_results.append(("Update Contract", "FAIL"))

# 4. LIST CONTRACTS
resp = client.get("/api/contracts/", **headers)
if resp.status_code == 200:
    count = len(resp.json())
    print(f"✓ List Contracts: {resp.status_code} ({count} contracts)")
    tests_passed += 1
    test_results.append(("List Contracts", "PASS"))
else:
    print(f"✗ List Contracts: {resp.status_code}")
    tests_failed += 1
    test_results.append(("List Contracts", "FAIL"))

# 5. CREATE CONTRACT VERSION
resp = client.post(
    f"/api/contracts/{contract_id}/create-version/",
    json.dumps({
        "selected_clauses": ["CONF-001", "TERM-001"],
        "change_summary": "Updated contract"
    }),
    content_type='application/json',
    **headers
)
if resp.status_code in [200, 201]:
    print(f"✓ Create Contract Version: {resp.status_code}")
    tests_passed += 1
    test_results.append(("Create Contract Version", "PASS"))
else:
    print(f"✗ Create Contract Version: {resp.status_code}")
    print(f"  Error: {resp.json()}")
    tests_failed += 1
    test_results.append(("Create Contract Version", "FAIL"))

# 6. CLONE CONTRACT
resp = client.post(
    f"/api/contracts/{contract_id}/clone/",
    json.dumps({"title": "Cloned Contract"}),
    content_type='application/json',
    **headers
)
if resp.status_code in [200, 201]:
    print(f"✓ Clone Contract: {resp.status_code}")
    tests_passed += 1
    test_results.append(("Clone Contract", "PASS"))
else:
    print(f"✗ Clone Contract: {resp.status_code}")
    print(f"  Error: {resp.json()}")
    tests_failed += 1
    test_results.append(("Clone Contract", "FAIL"))

# 7. CONTRACT VERSIONS
resp = client.get(f"/api/contracts/{contract_id}/versions/", **headers)
if resp.status_code == 200:
    print(f"✓ List Contract Versions: {resp.status_code}")
    tests_passed += 1
    test_results.append(("List Contract Versions", "PASS"))
else:
    print(f"✗ List Contract Versions: {resp.status_code}")
    tests_failed += 1
    test_results.append(("List Contract Versions", "FAIL"))

# 8. TEMPLATES
print("\n" + "=" * 80)
print("TEMPLATES")
print("=" * 80)

template_id = None

resp = client.post(
    "/api/contract-templates/",
    json.dumps({
        "name": "Test Template",
        "contract_type": "NDA",
        "description": "Test Template",
        "r2_key": "test-template-key.docx",
        "merge_fields": ["company_name", "date"],
        "status": "draft"
    }),
    content_type='application/json',
    **headers
)

if resp.status_code in [200, 201]:
    template_id = resp.json().get('id')
    print(f"✓ Create Template: {resp.status_code}")
    print(f"  → Template ID: {template_id}")
    tests_passed += 1
    test_results.append(("Create Template", "PASS"))
else:
    print(f"✗ Create Template: {resp.status_code}")
    print(f"  Error: {resp.json()}")
    tests_failed += 1
    test_results.append(("Create Template", "FAIL"))

# 9. LIST TEMPLATES
resp = client.get("/api/contract-templates/", **headers)
if resp.status_code == 200:
    print(f"✓ List Templates: {resp.status_code}")
    tests_passed += 1
    test_results.append(("List Templates", "PASS"))
else:
    print(f"✗ List Templates: {resp.status_code}")
    tests_failed += 1
    test_results.append(("List Templates", "FAIL"))

# 10. NOTIFICATIONS
print("\n" + "=" * 80)
print("NOTIFICATIONS")
print("=" * 80)

resp = client.post(
    "/api/notifications/",
    json.dumps({
        "message": "Test notification",
        "notification_type": "email",
        "subject": "Test Subject",
        "body": "Test Body",
        "recipient_id": user_id
    }),
    content_type='application/json',
    **headers
)

if resp.status_code in [200, 201]:
    print(f"✓ Create Notification: {resp.status_code}")
    tests_passed += 1
    test_results.append(("Create Notification", "PASS"))
else:
    print(f"✗ Create Notification: {resp.status_code}")
    print(f"  Error: {resp.json()}")
    tests_failed += 1
    test_results.append(("Create Notification", "FAIL"))

# 11. LIST NOTIFICATIONS
resp = client.get("/api/notifications/", **headers)
if resp.status_code == 200:
    count = len(resp.json())
    print(f"✓ List Notifications: {resp.status_code} ({count} notifications)")
    tests_passed += 1
    test_results.append(("List Notifications", "PASS"))
else:
    print(f"✗ List Notifications: {resp.status_code}")
    tests_failed += 1
    test_results.append(("List Notifications", "FAIL"))

# 12. WORKFLOWS
print("\n" + "=" * 80)
print("WORKFLOWS")
print("=" * 80)

resp = client.post(
    "/api/workflows/",
    json.dumps({
        "name": "Test Workflow",
        "description": "Test workflow description",
        "steps": []
    }),
    content_type='application/json',
    **headers
)

if resp.status_code in [200, 201]:
    print(f"✓ Create Workflow: {resp.status_code}")
    tests_passed += 1
    test_results.append(("Create Workflow", "PASS"))
else:
    print(f"✗ Create Workflow: {resp.status_code}")
    print(f"  Error: {resp.json()}")
    tests_failed += 1
    test_results.append(("Create Workflow", "FAIL"))

# 13. LIST WORKFLOWS
resp = client.get("/api/workflows/", **headers)
if resp.status_code == 200:
    print(f"✓ List Workflows: {resp.status_code}")
    tests_passed += 1
    test_results.append(("List Workflows", "PASS"))
else:
    print(f"✗ List Workflows: {resp.status_code}")
    tests_failed += 1
    test_results.append(("List Workflows", "FAIL"))

# 14. METADATA
print("\n" + "=" * 80)
print("METADATA")
print("=" * 80)

resp = client.post(
    "/api/metadata/fields/",
    json.dumps({
        "name": "test_field",
        "field_type": "text",
        "description": "Test field"
    }),
    content_type='application/json',
    **headers
)

if resp.status_code in [200, 201]:
    print(f"✓ Create Metadata Field: {resp.status_code}")
    tests_passed += 1
    test_results.append(("Create Metadata Field", "PASS"))
else:
    print(f"✗ Create Metadata Field: {resp.status_code}")
    print(f"  Error: {resp.json()}")
    tests_failed += 1
    test_results.append(("Create Metadata Field", "FAIL"))

# 15. LIST METADATA
resp = client.get("/api/metadata/fields/", **headers)
if resp.status_code == 200:
    print(f"✓ List Metadata Fields: {resp.status_code}")
    tests_passed += 1
    test_results.append(("List Metadata Fields", "PASS"))
else:
    print(f"✗ List Metadata Fields: {resp.status_code}")
    tests_failed += 1
    test_results.append(("List Metadata Fields", "FAIL"))

# 16. DOCUMENTS
print("\n" + "=" * 80)
print("DOCUMENTS & REPOSITORY")
print("=" * 80)

# 17. LIST DOCUMENTS
resp = client.get("/api/documents/", **headers)
if resp.status_code == 200:
    print(f"✓ List Documents: {resp.status_code}")
    tests_passed += 1
    test_results.append(("List Documents", "PASS"))
else:
    print(f"✗ List Documents: {resp.status_code}")
    tests_failed += 1
    test_results.append(("List Documents", "FAIL"))

# 18. REPOSITORY
resp = client.get("/api/repository/", **headers)
if resp.status_code == 200:
    print(f"✓ Repository Contents: {resp.status_code}")
    tests_passed += 1
    test_results.append(("Repository Contents", "PASS"))
else:
    print(f"✗ Repository Contents: {resp.status_code}")
    tests_failed += 1
    test_results.append(("Repository Contents", "FAIL"))

# 19. FOLDERS
resp = client.get("/api/repository/folders/", **headers)
if resp.status_code == 200:
    print(f"✓ Repository Folders: {resp.status_code}")
    tests_passed += 1
    test_results.append(("Repository Folders", "PASS"))
else:
    print(f"✗ Repository Folders: {resp.status_code}")
    tests_failed += 1
    test_results.append(("Repository Folders", "FAIL"))

# SUMMARY
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)

for test_name, result in test_results:
    status_symbol = "✓" if result == "PASS" else "✗"
    print(f"{status_symbol} {test_name}: {result}")

print("\n" + "=" * 80)
print(f"TOTAL: {tests_passed} PASSED, {tests_failed} FAILED out of {tests_passed + tests_failed}")
print(f"Pass Rate: {(tests_passed / (tests_passed + tests_failed) * 100):.1f}%")
print("=" * 80)
