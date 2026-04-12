---
sidebar_position: 3
---

# Ensuring Same Server

To ensure that your activities run on the same server so that they can share data using the local file system, you can use the `$queue` property on your workflow and activity classes. Set the `$queue` property to the name of a dedicated queue that is only processed by the desired server.

In order to run a queue worker that only processes the `my_dedicated_queue` queue, you can use the `php artisan queue:work --queue=my_dedicated_queue` command. Alternatively, you can use Laravel Horizon to manage your queues. Horizon is a queue manager that provides a dashboard for monitoring the status of your queues and workers.
