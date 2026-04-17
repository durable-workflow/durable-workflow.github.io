---
slug: converting-videos-with-ffmpeg
title: Converting Videos with FFmpeg and Workflow
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [video, ffmpeg, conversion, transcoding]
---

[FFmpeg](https://ffmpeg.org/) is a free, open-source software project allowing you to record, convert and stream audio and video.

[Laravel Queues](https://laravel.com/docs/9.x/queues) are great for long running tasks. Converting video takes a long time! With [Workflow](https://github.com/durable-workflow/workflow), you can harness the power of queues to convert videos in the background and easily manage the process.

Requirements
============

1.  You’ll need to [install FFmpeg](https://ffmpeg.org/download.html)
2.  Then `composer require php-ffmpeg/php-ffmpeg` ([docs](https://github.com/PHP-FFMpeg/PHP-FFMpeg#readme))
3.  Finally `composer require laravel-workflow/laravel-workflow` ([docs](https://github.com/durable-workflow/workflow))

Workflow
========

A workflow is an easy way to orchestrate activities. A workflow that converts a video from one format to another might have several activities, such as downloading the video from storage, the actual conversion, and then finally notifying the user that it’s finished.

For simplicity, the workflow we are making today will only contain the most interesting activity, converting the video.

```php
namespace App\Workflows\ConvertVideo;

use function Workflow\activity;
use Workflow\Workflow;

class ConvertVideoWorkflow extends Workflow
{
    public function execute()
    {
        yield activity(
            ConvertVideoWebmActivity::class,
            storage_path('app/oceans.mp4'),
            storage_path('app/oceans.webm'),
        );
    }
}
```

We need a video to convert. We can use this one:

[http://vjs.zencdn.net/v/oceans.mp4](http://vjs.zencdn.net/v/oceans.mp4)

Download it and save it to your app storage folder.

```php
namespace App\Workflows\ConvertVideo;

use FFMpeg\FFMpeg;
use FFMpeg\Format\Video\WebM;
use Workflow\Activity;

class ConvertVideoWebmActivity extends Activity
{
    public $timeout = 5;

    public function execute($input, $output)
    {
        $ffmpeg = FFMpeg::create();
        $video = $ffmpeg->open($input);
        $format = new WebM();
        $format->on('progress', fn () => $this->heartbeat());
        $video->save($format, $output);
    }
}
```

The activity converts any input video into a [WebM](https://www.webmproject.org/) output video. While ffmpeg is converting the video, a progress callback is triggered which in turn heartbeats the activity.

This is necessary because we have set a reasonable timeout of 5 seconds but we also have no idea how long it will take to convert the video. As long as we send a heartbeat at least once every 5 seconds, the activity will not timeout.

![heartbeat](https://miro.medium.com/max/1400/1*ccrxeOEZYQciDYEprRKWiQ.webp)

![no heartbeat](https://miro.medium.com/max/1400/1*9ZF3LTqjf4qsVcNVX5LK0A.webp)

Without a heartbeat, the worker will be killed after the timeout of 5 seconds is reached.

To actually run the workflow you just need to call:

```php
WorkflowStub::make(ConvertVideoWorkflow::class)->start();
```

And that’s it!
