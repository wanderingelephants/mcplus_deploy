# 🚀 Application Deployment Guide: MCP-Plus Docker Stack

This document provides a professional and comprehensive guide for deploying the **MCP-Plus Application Stack** using Docker Compose. The entire application is packaged into container images, which will be fetched from Docker Hub, eliminating the need for local building by end-users.

## 🎯 System Architecture Components

The application is composed of five key services coordinated by Docker Compose. 

| Component | Technology | Role | External Port | Dependencies |
| :--- | :--- | :--- | :--- | :--- |
| **Database** | PostgreSQL | Persistent data storage and relational backend. | `5432` | None |
| **GraphQL Engine** | Hasura GraphQL | Provides instant, real-time GraphQL APIs over PostgreSQL. | `8081` | `postgres_db` |
| **API Server** | Node.js Express | Handles business logic, security (Firebase Admin), and state. | `3000`/`3001` | `graphql` |
| **Code Sandbox** | Deno-Executor | Isolated environment for executing dynamic JavaScript code. | `4123` | None (accesses API via network) |
| **Client** | Vue3 / NGINX | Front-end application served by a web server. | `80` | `api` |

---

## ⚙️ Prerequisites

Before deploying the application, ensure you have the following installed and configured:

1.  **Docker and Docker Compose:** Required to run and manage the containerized application stack.
2.  **External Services Setup:** Accounts and projects in Hasura and Firebase are necessary to obtain configuration secrets.

### 1. Hasura GraphQL Project Setup

* **Action:** Create a new project on [Hasura Cloud](https://cloud.hasura.io/).
* **Credential:** Navigate to your project details and find the **Admin Secret**. This is a long, crucial alphanumeric string that secures access to your GraphQL engine.
    * **Result:** This value will be set as `HASURA_ADMIN_SECRET`.

### 2. Google Firebase Project Setup

The Firebase project is used for user authentication ("Sign-In with Google") and server-side verification.

#### A. Configure Authentication and Authorized Domain

1.  Create a new project in the [Firebase Console](https://console.firebase.google.com/).
2.  Create a **Web App** within the project.
3.  Go to **Authentication** $\rightarrow$ **Sign-in method** and enable the **Google** provider.
4.  Go to **Authentication** $\rightarrow$ **Settings**. Under **Authorized domains**, click **Add domain** and add `localhost`. **This step is mandatory** for local development/deployment.

#### B. Obtain UI Firebase Configuration (Client)

1.  Go to **Project Settings** (gear icon).
2.  In the "Your apps" section, find your web app and select **Config** under the SDK setup.
3.  Copy the values for `apiKey`, `authDomain`, `projectId`, and `appId`.
    * **Result:** These will populate `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, and `FIREBASE_APP_ID` in the `.env` file.

#### C. Obtain Server Firebase Configuration (Service Account)

1.  Go to **Project Settings** $\rightarrow$ **Service accounts** tab.
2.  Click **Generate new private key** and download the JSON file.
3.  **Rename** the downloaded file to `firebase-admin.json`.
4.  **Place** this file in the local data directory: `./data/config/`.

---

## 🛠️ Deployment Steps

Configure Environment Files

A. .env File (General & Client Config)
Replace the placeholder values (<...SECRET>) with your credentials.

ENVIRONMENT=local
DATA_ROOT_FOLDER=../data
PG_CONTAINER_NAME="postgres"
PG_IMAGE="postgres:latest"
PG_PORT=5432
PG_PASSWORD="Welcome123" # <<< CHANGE THIS PASSWORD
PG_LOCAL_VOLUME="../data/postgresql_database"
POSTGRES_URL=postgres:Welcome123@host.docker.internal:5432/postgres
HASURA_ADMIN_SECRET=<YOUR_HASURA_ADMIN_SECRET>
GRAPHQL_EXTERNAL_PORT=8081
NODE_API_URL=[http://host.docker.internal:3000](http://host.docker.internal:3000)
NODE_API_WS_URL=[http://host.docker.internal:3001](http://host.docker.internal:3001)
FIREBASE_API_KEY=<YOUR_FIREBASE_API_KEY>
FIREBASE_AUTH_DOMAIN=<YOUR_FIREBASE_AUTH_DOMAIN>
FIREBASE_PROJECT_ID=<YOUR_FIREBASE_PROJECT_ID>
FIREBASE_APP_ID=<YOUR_FIREBASE_APP_ID>
UI_GRAPHQL_ENDPOINT=http://localhost:8081
UI_GRAPHQL_SOCKET_ENDPOINT=ws://localhost:8081

B. mcpapi.env File (Node.js API Server Config)
Set the critical HASURA_JWT_SECRET to a strong, unique value.

DATA_ROOT_FOLDER=/app/data
HASURA_JWT_SECRET=<GENERATE_A_STRONG_UNIQUE_JWT_SECRET>
HASURA_ADMIN_SECRET=<YOUR_HASURA_ADMIN_SECRET>
HASURA_ENDPOINT=http://graphql:8080
DENO_HOST_PORT=http://deno-executor:4123
LLM=Gemini
LLM_MODEL=gemini-2.5-flash
GEMINI_API_KEY=<YOUR_GEMINI_API_KEY>
MCP_PLUS_API_KEY=<YOUR_MCP_PLUS_API_KEY>
MCP_PLUS_HOST=[https://dipsip.co](https://dipsip.co)

chmod +x create_docker_network.sh start_all.sh

start the application - ./start_all.sh
