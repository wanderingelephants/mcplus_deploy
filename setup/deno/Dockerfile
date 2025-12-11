# -----------------------
# Builder stage (Node) - builds & obfuscates the bundle
# -----------------------
FROM node:20-bullseye AS builder

WORKDIR /build

# Copy only the files needed to build the bundle
# (this keeps the build context minimal if you use a .dockerignore)
COPY package.json package-lock.json build.js server.ts ./

# Install dev deps (esbuild + javascript-obfuscator) locally in builder
RUN npm ci --silent

# Run the local build script which should produce server.obf.js in /build
RUN node build.js

# -----------------------
# Final stage (Deno runtime) - only the obfuscated JS is copied
# -----------------------
FROM denoland/deno:latest

# Create app dir
WORKDIR /app

# Copy only the obfuscated output from builder
COPY --from=builder /build/server.obf.js /app/server.obf.js

# Ensure the file is owned by the deno user and not world-readable if you want
# The official deno image has a "deno" user; set owner accordingly.
# If the deno user id differs in your image, adjust as needed.
USER root
RUN chown deno:deno /app/server.obf.js && \
    chmod 500 /app/server.obf.js

# Switch to deno user for runtime
USER deno

# Expose port and run
EXPOSE 4123

CMD ["run", "--allow-net", "--deny-write", "--deny-read", "--allow-env", "/app/server.obf.js"]
