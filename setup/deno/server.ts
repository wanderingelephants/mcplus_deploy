import { serve } from "https://deno.land/std/http/server.ts";
const PORT = 4123;
const WS_URL = Deno.env.get("NODE_API_WS_URL") || "ws://api:3001";
const API_URL = Deno.env.get("NODE_API_URL") || "http://api:3000";

let denoWs: WebSocket | null = null;
const activeJobs = new Map<string, { worker: Worker; controller: AbortController }>();

const connectToNodeWs = () => {
  try {
    denoWs = new WebSocket(WS_URL);
    denoWs.onopen = () => console.log("Deno connected to Node.js WebSocket server.");
    denoWs.onclose = () => {
      console.warn("Deno WS disconnected. Reconnecting in 5s...");
      setTimeout(connectToNodeWs, 5000);
    };
    denoWs.onerror = (e) => console.error("Deno WS error:", e);
  } catch (err) {
    console.error("Failed to connect Deno WS:", err);
    setTimeout(connectToNodeWs, 5000);
  }
};
connectToNodeWs();

const sendLogToNode = (sessionId: string, log: string) => {
  if (denoWs && denoWs.readyState === WebSocket.OPEN) {
    denoWs.send(JSON.stringify({ type: "DENO_LOG", sessionId, log }));
  } else {
    console.warn("Deno WS not open, log dropped:", log);
  }
};

const generateDynamicApiDefinitions = (dynamicEndpoints: Record<string, string>): string => {
  let definitions = "";
  for (const [userFunctionName, endpointPathSegment] of Object.entries(dynamicEndpoints)) {
    const safePathSegment = endpointPathSegment.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    definitions += `const ${userFunctionName} = (opts) => apiCall("${safePathSegment}", opts);\n`;
  }
  return definitions;
};

const httpHandler = async (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname === "/exec" && req.method === "POST") {
    try {
      const body = await req.json();
      console.log("body", body)
      const { mcp_plus_api_key, functionText, functionArgs, sessionId, email, timeout, dynamicEndpoints } = body;
      console.log("server.ts", new Date(), functionText, functionArgs, sessionId, email, mcp_plus_api_key)
      if (
        typeof functionText !== "string" ||
        !/^(\s*(async\s+)?function\b|\s*async\s*\(|\s*\()/.test(functionText.trim())
      ) {
        return new Response(JSON.stringify({ error: "Invalid function format" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      let functionName = "";
      const match = functionText.match(/(?:async\s+)?function\s+(\w+)\s*\(/);
      if (match && match[1]) {
        functionName = match[1];
      }
      const timeoutMs =
        typeof timeout === "number" && timeout > 0 ? timeout * 1000 : 300_000; // seconds → ms

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const dynamicDefinitions =
        typeof dynamicEndpoints === 'object' && dynamicEndpoints !== null
          ? generateDynamicApiDefinitions(dynamicEndpoints)
          : "";
      const workerCode = `
        const API_URL = "${API_URL}";
        const sId = "${sessionId}";
        const api_key = "${mcp_plus_api_key}";
        const email = "${email}"
        const apiCall = async (endpoint, payload) => {
          payload["sessionId"] = sId
          payload["email"] = email
          const res = await fetch(\`\${API_URL}/api/mcp/tools/\${endpoint}\`, { 
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (!res.ok) throw new Error(JSON.stringify(json));
          return json;
        };
        
        ${dynamicDefinitions}
        
        const createUTCDate = (d) => {
          const [y, m, day] = d.split('-').map(Number);
          return new Date(Date.UTC(y, m - 1, day));
        };
        const originalConsole = { log: console.log, error: console.error, warn: console.warn };
        const customLogger = (type, ...args) => {
          const logMsg = args.map(a => {
            try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
            catch(e){ return '[Unserializable]'; }
          }).join(' ');
          self.postMessage({ type: "LOG", log: logMsg, level: type });
          originalConsole[type](\`[User Code Log \${type.toUpperCase()}]\`, logMsg);
        };
        console.log = (...a)=>customLogger('log',...a);
        console.error = (...a)=>customLogger('error',...a);
        console.warn = (...a)=>customLogger('warn',...a);
        
        self.onmessage = async (e)=>{
          const {functionText, functionArgs, functionName} = e.data;
          const startTime = performance.now();

          try {
            const f = eval("(" + functionText + "\\n)\\n//# sourceURL=" + functionName + ".js");
            
            const r = await f(functionArgs);
            const endTime = performance.now();
            const durationMs = (endTime - startTime).toFixed(2);
            
            self.postMessage({ type:"RESULT", result:r });
            self.postMessage({ 
              type: "LOG", 
              log: \`Function "\${functionName}" Done. Time taken: \${durationMs}ms.\`, 
              level: "log" 
            });
          } catch(err){
            let lineInfo = "";
            let fullErrorMessage = err.message;
            let stackTrace = err.stack || String(err);
            if (stackTrace) {
              const regex = new RegExp(functionName + "\\.js:(\\d+)");
              const match = stackTrace.match(regex);
              if (match && match[1]) {
                lineInfo = \` (Line \${match[1]})\`;
                fullErrorMessage = \`Error in user code\${lineInfo}: \${err.message}\`;
              }
              else{
                const firstStackLine = stackTrace.split('\\n')[1] || '';
                fullErrorMessage = \`\${err.message} [Stack: \${firstStackLine.trim()}]\`;
              }
            }
            self.postMessage({ type:"ERROR", error: fullErrorMessage });
            self.postMessage({ type: "LOG", log: \`Error in Job: "\${functionName}" - \${fullErrorMessage}\`, level: "error" });
          }
        };
      `;
      console.log("workerCode", workerCode)
      const blob = new Blob([workerCode], { type: "application/javascript" });
      const worker = new Worker(URL.createObjectURL(blob), { type: "module" });
      if (sessionId) activeJobs.set(sessionId, { worker, controller });
      let status = "DONE";

      const jobStartTime = performance.now();

      const result = await new Promise((resolve, reject) => {
        controller.signal.addEventListener("abort", () => {
          worker.terminate();
          status = "TIMED_OUT";
          reject(new Error("Function execution timed out"));
        });

        worker.onmessage = (e) => {
          const msg = e.data;
          if (msg.type === "RESULT") {
            clearTimeout(timeoutId);
            resolve(msg.result);
          } else if (msg.type === "ERROR") {
            clearTimeout(timeoutId);
            status = "ABORTED";
            reject(new Error(msg.error));
          } else if (msg.type === "LOG") {
            sendLogToNode(sessionId, `[${msg.level.toUpperCase()}] ${msg.log}`);
          }
        };

        worker.onerror = (err) => {
          clearTimeout(timeoutId);
          status = "ABORTED";
          reject(new Error("error: " + err.message));
        };
        worker.postMessage({ functionText, functionArgs, functionName });
      })
        .then((res) => ({ status: "DONE", denoResult: res }))
        .catch((err) => ({ status, error: err.message, denoResult: {} }));

      activeJobs.delete(sessionId);

      const jobEndTime = performance.now();
      const totalDurationMs = (jobEndTime - jobStartTime).toFixed(2);
      console.log(`Job "${functionName}" finished in ${totalDurationMs}ms (status: ${result.status})`);

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      // 1. Check if 'err' is an instance of the standard JavaScript Error class.
      if (err instanceof Error) {
        // 2. If it is an Error object, TypeScript knows it has a 'message' property.
        return new Response(
          JSON.stringify({ status: "ABORTED", error: err.message }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      // 3. If it's NOT a standard Error object (e.g., a string or a plain object), 
      // we default to a generic message, safely converting the unknown type to a string.
      return new Response(
        JSON.stringify({ status: "ABORTED", error: String(err) }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
  }
  if (url.pathname === "/abort" && req.method === "POST") {
    try {
      const body = await req.json();
      const { sessionId } = body;

      if (!sessionId) {
        return new Response(JSON.stringify({ error: "Missing sessionId" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      const job = activeJobs.get(sessionId);
      if (!job) {
        return new Response(
          JSON.stringify({ status: "NOT_FOUND", error: "No active job for this sessionId" }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      job.worker.terminate();
      job.controller.abort();
      activeJobs.delete(sessionId);

      return new Response(JSON.stringify({ status: "USER_ABORT" }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      // 1. Check if 'err' is an instance of the standard JavaScript Error class.
      if (err instanceof Error) {
        // 2. If it is an Error object, TypeScript knows it has a 'message' property.
        return new Response(
          JSON.stringify({ status: "ABORTED", error: err.message }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      // 3. If it's NOT a standard Error object (e.g., a string or a plain object), 
      // we default to a generic message, safely converting the unknown type to a string.
      return new Response(
        JSON.stringify({ status: "ABORTED", error: String(err) }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
  }
  return new Response("Not found", { status: 404 });
};

serve(httpHandler, { port: PORT });