const { spawn } = require("child_process");
const net = require("net");

const PORTS = [3001, 3000, 3002];

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function findPort() {
  for (const port of PORTS) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  console.error(`No available port among ${PORTS.join(", ")}`);
  process.exit(1);
}

async function main() {
  const port = await findPort();

  if (port !== 3001) {
    console.log(`Port 3001 is busy, using http://localhost:${port} instead`);
  }

  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main();
