use std::{env, time::Duration};

use durable_workflow::{Client, Worker};
use serde_json::json;
use tokio::signal::unix::{signal, SignalKind};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::builder(env::var("DW_SERVER_URL")?)
        .namespace(env::var("DW_NAMESPACE")?)
        .worker_token(Some(env::var("DW_WORKER_TOKEN")?))
        .timeout(Duration::from_secs(5))
        .build()?;
    let mut worker = Worker::new(client, env::var("DW_TASK_QUEUE")?)
        .worker_id(env::var("DW_WORKER_ID")?)
        .poll_timeout(Duration::from_secs(1));
    worker.register_workflow("website336.echo", |context, input| async move {
        context.activity("website336.greet", input).await
    });
    worker.register_activity("website336.greet", |_, input| async move {
        Ok(json!({"sdk": "rust", "name": input[0], "worker_id": env::var("DW_WORKER_ID").unwrap()}))
    });
    let mut terminate = signal(SignalKind::terminate())?;
    worker.run_until(async { terminate.recv().await; }).await?;
    println!("{}", json!({"event": "worker_stopped", "sdk": "rust"}));
    Ok(())
}
