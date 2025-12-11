#!/bin/bash

HASURA_ADMIN_SECRET=$(grep HASURA_ADMIN_SECRET ../../.env  | cut -d '=' -f2-)

# Apply migrations and metadata
hasura migrate apply \
  --admin-secret "$HASURA_ADMIN_SECRET" \
  --endpoint "http://localhost:8081"

hasura metadata apply \
  --admin-secret "$HASURA_ADMIN_SECRET" \
  --endpoint "http://localhost:8081"