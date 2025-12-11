#!/bin/bash
NETWORK_NAME="mcp_plus_inter_service_network"

echo "Checking if Docker network '$NETWORK_NAME' exists..."

if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    echo "Docker network '$NETWORK_NAME' already exists. Skipping creation."
else
    echo "Creating Docker network '$NETWORK_NAME'..."
    docker network create "$NETWORK_NAME"

    if [ $? -eq 0 ]; then
        echo "Network '$NETWORK_NAME' created successfully."
    else
        echo "Failed to create network '$NETWORK_NAME'."
        exit 1
    fi
fi

echo "Done."