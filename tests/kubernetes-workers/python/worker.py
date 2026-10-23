import asyncio
import json
import os
import signal

from durable_workflow import Client, Worker, activity, workflow


@activity.defn(name="website336.greet")
async def greet(name: str):
    return {"sdk": "python", "name": name, "worker_id": os.environ["DW_WORKER_ID"]}


@workflow.defn(name="website336.echo")
class Echo:
    def run(self, context, name: str):
        return (yield context.schedule_activity("website336.greet", [name]))


async def main():
    async with Client(
        os.environ["DW_SERVER_URL"],
        namespace=os.environ["DW_NAMESPACE"],
        worker_token=os.environ["DW_WORKER_TOKEN"],
        timeout=5,
    ) as client:
        worker = Worker(
            client,
            task_queue=os.environ["DW_TASK_QUEUE"],
            worker_id=os.environ["DW_WORKER_ID"],
            workflows=[Echo], activities=[greet], poll_timeout=1, shutdown_timeout=10,
        )
        shutdown = asyncio.Event()
        loop = asyncio.get_running_loop()
        for requested_signal in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(requested_signal, shutdown.set)
        run_task = asyncio.create_task(worker.run())
        try:
            await shutdown.wait()
        finally:
            try:
                await worker.stop()
            finally:
                await run_task
        print(json.dumps({"event": "worker_stopped", "sdk": "python"}), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
