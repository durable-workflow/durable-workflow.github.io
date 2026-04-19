---
slug: automating-qa-with-playwright-and-laravel-workflow
title: "Automating QA with Playwright and Workflow"
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [playwright, workflow, automation, qa, testing]
---

import ThemedImage from '@site/src/components/ThemedImage';

![playwright](https://miro.medium.com/v2/resize:fit:300/format:webp/1*b6eXVs5J3aRNzYAiqnS9Vw.png)

Have you ever spent hours tracking down a frontend bug that only happens in production? When working with web applications, debugging frontend issues can be challenging. Console errors and unexpected UI behaviors often require careful inspection and reproducible test cases. Wouldn’t it be great if you could automate this process, capture errors, and even record a video of the session for later analysis?

With **Playwright** and **Workflow**, you can achieve just that! In this post, I’ll walk you through an automated workflow that:

*   Loads a webpage and captures console errors.
*   Records a video of the session.
*   Converts the video to an MP4 format for easy sharing.
*   Runs seamlessly in a **GitHub Codespace**.

## The Stack

*   **Playwright**: A powerful browser automation tool for testing web applications.
*   **Workflow**: A durable workflow engine for handling long-running, distributed processes.
*   **FFmpeg**: Used to convert Playwright’s WebM recordings to MP4 format.

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNpNkl1v0zAUhv_K0bngKhtNSdYmQkMsbbZJFKYVMUHSC68-TS0SO3LtbqPtf8d2mMadj5_3PV86B1wrTpjjplVP6y3TBr7PagnwuVoaHz0o_duzFZydXcJVdW8l3LXs5UmLZmtgudaiN6taes-V1xwL1hurCQold6olmGut9O4IxWF4Qams5J9O3lEEx09yeFZ9Uc0_8eqNfVVHmFculxHSUgCz0EpZvbbmKnV9S2ag84H-39E9rZXm8ENwctmuqyXbEzzQ4wJK0Q6u6-C68YX25Mf21ChY3CWwF-zjo35_WZZdT02Q3wT5rduRcpO-g2_W9NZ4dcC3Qw8YYaMFx9xoSxF2pDvmQzx4UY1mSx3VmLsnpw2zramxlidn65n8pVT36tTKNlvMN6zducj2nBmaCdZo9iYhyUkXbrUG8yxkwPyAz5gno-w8i9M4HiXpeJpNxkmEL-774nw6SbJJOk3H8YeLSZycIvwTio4cSSMkLtx4i-E-wpmc_gKg97DW?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNpNkl1P2zAUhv-KdS52FbrWNMGNEBOkDSDRDVEE2pJemOaQWiR25NoF1va_z3Zg252Pn_c9Xzo7WKkKIYXnRr2u1lwbcj8tJSHnxcL46FHpF8-W5OjojFwUd1aS24a_v2pRrw1ZrLTozLKU3nPhNfuMd8ZqJJmSG9UgmWmt9GZPsl3_Irmysvp28I4sOH6iw9PiRtUf4uU_9l3tyaxwuYyQFgOYhlby4rM1V6ntGjQ9nfX0_47ucKV0RR5EhS7bZbHgWySP-DQnuWh612VwXflCW_Rje2oUmd-OyVbw0yf99SzP2w7rIL8K8mu3I-Um_UJ-WNNZ49UBX_c9QAS1FhWkRluMoEXdch_CzotKMGtssYTUPSuuX0oo5cF5Oi5_KdV-2rSy9RrSZ95sXGS7ihucCl5r3v791Sgr1JlbrIGUxiEHpDt4g3SUxIPkhMUnI0bj4YQNkwjenYglg2QcJ2wypkMW0_j4EMHvUHY4iMfHE8omdEQpTVjCIsBKuFHn_a2Ekzn8AZMbsr4?type=png"
  lightLink="https://mermaid.live/edit#pako:eNpNkl1v0zAUhv_K0bngKhtNSdYmQkMsbbZJFKYVMUHSC68-TS0SO3LtbqPtf8d2mMadj5_3PV86B1wrTpjjplVP6y3TBr7PagnwuVoaHz0o_duzFZydXcJVdW8l3LXs5UmLZmtgudaiN6taes-V1xwL1hurCQold6olmGut9O4IxWF4Qams5J9O3lEEx09yeFZ9Uc0_8eqNfVVHmFculxHSUgCz0EpZvbbmKnV9S2ag84H-39E9rZXm8ENwctmuqyXbEzzQ4wJK0Q6u6-C68YX25Mf21ChY3CWwF-zjo35_WZZdT02Q3wT5rduRcpO-g2_W9NZ4dcC3Qw8YYaMFx9xoSxF2pDvmQzx4UY1mSx3VmLsnpw2zramxlidn65n8pVT36tTKNlvMN6zducj2nBmaCdZo9iYhyUkXbrUG8yxkwPyAz5gno-w8i9M4HiXpeJpNxkmEL-774nw6SbJJOk3H8YeLSZycIvwTio4cSSMkLtx4i-E-wpmc_gKg97DW"
  darkLink="https://mermaid.live/edit#pako:eNpNkl1P2zAUhv-KdS52FbrWNMGNEBOkDSDRDVEE2pJemOaQWiR25NoF1va_z3Zg252Pn_c9Xzo7WKkKIYXnRr2u1lwbcj8tJSHnxcL46FHpF8-W5OjojFwUd1aS24a_v2pRrw1ZrLTozLKU3nPhNfuMd8ZqJJmSG9UgmWmt9GZPsl3_Irmysvp28I4sOH6iw9PiRtUf4uU_9l3tyaxwuYyQFgOYhlby4rM1V6ntGjQ9nfX0_47ucKV0RR5EhS7bZbHgWySP-DQnuWh612VwXflCW_Rje2oUmd-OyVbw0yf99SzP2w7rIL8K8mu3I-Um_UJ-WNNZ49UBX_c9QAS1FhWkRluMoEXdch_CzotKMGtssYTUPSuuX0oo5cF5Oi5_KdV-2rSy9RrSZ95sXGS7ihucCl5r3v791Sgr1JlbrIGUxiEHpDt4g3SUxIPkhMUnI0bj4YQNkwjenYglg2QcJ2wypkMW0_j4EMHvUHY4iMfHE8omdEQpTVjCIsBKuFHn_a2Ekzn8AZMbsr4"
  alt="Playwright QA Workflow Diagram"
/>

#### 1. Capturing Errors and Video with Playwright

The Playwright script automates a browser session, navigates to a given URL, and logs any console errors. It also records a video of the entire session.

```javascript
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

(async () => {
    const url = process.argv[2];
    const videoDir = path.resolve('./videos');

    if (!fs.existsSync(videoDir)) {
        fs.mkdirSync(videoDir, { recursive: true });
    }

    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const context = await browser.newContext({
        recordVideo: { dir: videoDir }
    });

    const page = await context.newPage();

    let errors = [];

    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });

    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
    } catch (error) {
        errors.push(`Page load error: ${error.message}`);
    }
    const video = await page.video().path();

    await browser.close();

    console.log(JSON.stringify({ errors, video }));
})();
```

#### 2. Running the Workflow

A Laravel console command (`php artisan app:playwright`) starts the workflow which:

*   Runs the Playwright script and collects errors.
*   Converts the video from `.webm` to `.mp4` using FFmpeg.
*   Returns the errors and the final video file path.

```php
namespace App\Console\Commands;

use App\Workflows\Playwright\CheckConsoleErrorsWorkflow;
use Illuminate\Console\Command;
use Workflow\WorkflowStub;

class Playwright extends Command
{
    protected $signature = 'app:playwright';

    protected $description = 'Runs a playwright workflow';

    public function handle()
    {
        $workflow = WorkflowStub::make(CheckConsoleErrorsWorkflow::class);
        $workflow->start('https://example.com');
        while ($workflow->running());
        $this->info($workflow->output()['mp4']);
    }
}
```

#### 3. The Workflow

```php
namespace App\Workflows\Playwright;

use function Workflow\activity;
use Workflow\Workflow;

class CheckConsoleErrorsWorkflow extends Workflow
{
    public function execute(string $url)
    {
        $result = yield activity(CheckConsoleErrorsActivity::class, $url);

        $mp4 = yield activity(ConvertVideoActivity::class, $result['video']);

        return [
            'errors' => $result['errors'],
            'mp4' => $mp4,
        ];
    }
}
```

#### 4. Running Playwright

```php
namespace App\Workflows\Playwright;

use Illuminate\Support\Facades\Process;
use Workflow\Activity;

class CheckConsoleErrorsActivity extends Activity
{
    public function execute(string $url)
    {
        $result = Process::run([
            'node', base_path('playwright-script.js'), $url
        ])->throw();

        return json_decode($result->output(), true);
    }
}
```

#### 5. Video Conversion with FFmpeg

The Playwright recording is stored in WebM format, but we need an MP4 for wider compatibility. Workflow runs this process asynchronously.

```php
namespace App\Workflows\Playwright;

use Illuminate\Support\Facades\Process;
use Workflow\Activity;

class ConvertVideoActivity extends Activity
{
    public function execute(string $webm)
    {
        $mp4 = str_replace('.webm', '.mp4', $webm);

        Process::run([
            'ffmpeg', '-i', $webm, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', $mp4
        ])->throw();

        unlink($webm);

        return $mp4;
    }
}
```

## Try It Now in Your Browser

You don’t need to set up anything on your local machine. Everything is already configured in the Workflow [Sample App](https://github.com/durable-workflow/sample-app/tree/Laravel-12).

To try it:

1. Open the sample-app repo's `Laravel-12` branch on GitHub
2. Click **Code** → **Codespaces** → **Create codespace on Laravel-12**
3. Wait for the environment to build
4. Setup the app and start the queue worker:
   ```bash
   php artisan app:init
   php artisan queue:work
   ```
5. In a second terminal:
```bash
php artisan app:playwright
```

That’s it! The workflow will execute, capture console errors, record a video, and convert it to MP4. You can find the video in the videos folder. Take a look at the sample app’s README.md for more information on other workflows and how to view the Waterline UI.

## Conclusion

By integrating Playwright with Workflow, we’ve automated frontend error detection and debugging. This setup allows teams to quickly identify and resolve issues, all while leveraging Laravel’s queue system to run tasks asynchronously.
