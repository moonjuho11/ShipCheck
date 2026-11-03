// One scan in its own process. A hostile repo that hangs this process or runs it out of
// memory can't touch other scans, and it never sees the worker's database or encryption keys.
import { ScanRejected } from "@/scanner/errors";
import { runScan, type ScanInput } from "@/scanner";

// If the worker dies, take the whole scan down too instead of leaving it running.
process.on("disconnect", () => process.kill(0, "SIGKILL"));

const send = (message: unknown) => new Promise<void>((resolve) => process.send!(message, () => resolve()));

process.once("message", async (input: ScanInput) => {
  try {
    const result = await runScan({ ...input, onProgress: (steps) => send({ type: "progress", steps }) });
    await send({ type: "result", result });
  } catch (e) {
    await send({ type: "error", message: (e as Error).message, rejected: e instanceof ScanRejected });
  }
  process.exit(0);
});
