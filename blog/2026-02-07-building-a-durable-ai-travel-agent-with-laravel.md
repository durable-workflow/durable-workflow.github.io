---
slug: building-a-durable-ai-travel-agent-with-laravel
title: "Building a Durable AI Travel Agent with Laravel"
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [ai, workflow, agents, tools]
---

Look at these execution logs:

```
BookHotelActivity ........... RUNNING
Booking hotel: Grand Hotel, Paris, 2026-03-01 to 2026-03-03, 1 guest(s). Confirmation #902928
BookHotelActivity .......... 4.35ms DONE

BookFlightActivity .......... RUNNING
BookFlightActivity ......... 8.37ms FAIL

CancelHotelActivity ......... RUNNING
Cancelling hotel Hotel booked: Grand Hotel, Paris, check-in 2026-03-01,
check-out 2026-03-03, 1 guest(s). Confirmation #902928...
CancelHotelActivity ....... 3.74ms DONE

AiWorkflow ............... 10.96ms DONE
```

Read that again. A user asked to book a hotel and a flight in a single message. The hotel went through. The flight failed. And the system *automatically cancelled the hotel using the original confirmation number*. The user saw this:

```
Agent: Flight booking failed: New York to Paris.
       Any previous bookings have been cancelled.
```

Distributed transaction management that just works.

This is a durable AI travel agent built with the Laravel AI SDK and Durable Workflow. It's one continuous conversation where every possible outcome is handled gracefully: successful bookings, partial failures, timeouts, and saga compensation, all in about 100 lines of workflow code.

Let's build it.

## The Problem

Imagine you're tasked with building a conversational AI travel agent. Not a toy, a real one. Users chat with it, ask it to book hotels, flights, and rental cars, and expect it to handle failures gracefully.

Here's what you'd need with traditional Laravel patterns:

**State management.** A `conversation_state` table tracking where each user is in the flow. A state machine (or a mess of `if` statements) to handle transitions. What happens if the user sends a message while a booking is in progress? What if two queue workers pick up the same conversation?

**Failure handling.** An event listener on `BookingFailed`. Another listener to figure out which previous bookings need to be cancelled. A database query to look up confirmation numbers. A job to call each cancellation API. Another listener in case the *cancellation* fails.

**Timeouts.** A cron job that runs every minute, queries for "stale" conversations, and closes them. Edge cases when a user sends a message at the exact moment the cron job fires.

**Cleanup.** Scheduled commands to archive old conversations. Orphan detection for bookings that got confirmed but whose conversations crashed. Manual intervention scripts for the support team.

You're looking at 500+ lines of infrastructure code scattered across jobs, events, listeners, models, migrations, service classes, and cron configurations. And you haven't written a single line of business logic yet.

There's a better way.

## The Solution: Laravel AI SDK + Durable Workflows

We're going to build this with three things:

1. **Laravel AI SDK**, for the conversational agent and tool calling
2. **Durable Workflow**, for durable execution, saga compensation, and timeouts
3. **About 100 lines of actual business logic**

### Step 1: Create the Agent

```bash
php artisan make:agent TravelAgent
```

And give it some tools:

```bash
php artisan make:tool BookHotel
php artisan make:tool BookFlight
php artisan make:tool BookRentalCar
```

The agent is straightforward:

```php
class TravelAgent implements Agent, Conversational, HasTools
{
    use Promptable;

    private array $messages = [];

    public function instructions(): Stringable|string
    {
        return <<<'INSTRUCTIONS'
        You are a professional travel agent. Help users plan and book travel.

        BOOKING RULES:
        - When a user asks to book a hotel, flight, or rental car, ALWAYS call
          the appropriate booking tool immediately with whatever details they
          provided. Never ask for more details before calling the tool.
        - Use reasonable defaults for any missing information (e.g. 1 guest,
          next-day dates, economy class).
        - You may call multiple booking tools in a single response if the user
          requests multiple bookings.
        - For flights, always include a return date if the user mentions round
          trip, return dates, or trip end dates. Omit return_date only for
          explicitly one-way flights.

        CONVERSATION RULES:
        - Be concise and action-oriented.
        - After placing bookings, briefly confirm what was booked.
        - You can also help with itinerary planning, destination advice,
          packing lists, and general travel logistics.
        INSTRUCTIONS;
    }

    public function continue($messages): static
    {
        $this->messages = $messages;

        return $this;
    }

    public function messages(): iterable
    {
        return $this->messages;
    }

    public function tools(): iterable
    {
        return [
            new BookHotel(),
            new BookFlight(),
            new BookRentalCar(),
        ];
    }
}
```

Notice we implement `Conversational` but we don't use `RemembersConversations`. The workflow history is our conversation store. We pass it in through the `continue()` method.

### Step 2: The Tools Pattern

Here's the `BookHotel` tool:

```php
class BookHotel implements Tool
{
    public static array $pending = [];

    public function description(): Stringable|string
    {
        return 'Book a hotel for the user.';
    }

    public function handle(Request $request): Stringable|string
    {
        self::$pending[] = [
            'type' => 'book_hotel',
            'hotel_name' => $request['hotel_name'],
            'check_in_date' => $request['check_in_date'],
            'check_out_date' => $request['check_out_date'],
            'guests' => (int) $request['guests'],
        ];

        return 'Booking hotel: ' . $request['hotel_name'] . ' from '
            . $request['check_in_date'] . ' to ' . $request['check_out_date']
            . ' for ' . $request['guests'] . ' guest(s)';
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'hotel_name' => $schema->string()->required()->description('The name and location of the hotel to book'),
            'check_in_date' => $schema->string()->required()->description('Check-in date (YYYY-MM-DD)'),
            'check_out_date' => $schema->string()->required()->description('Check-out date (YYYY-MM-DD)'),
            'guests' => $schema->integer()->required()->description('Number of guests'),
        ];
    }
}
```

This is the key insight: **the tool doesn't book anything**. It collects structured data from the AI into a static `$pending` array and returns a confirmation message to the agent. The actual booking happens later, inside the workflow, as a durable activity.

Why? Because tool calls happen inside the AI activity. If we booked the hotel directly in the tool's `handle()` method, the workflow wouldn't know about it and couldn't compensate on failure. By collecting the requests and processing them in the workflow, every side effect is durable and reversible.

`BookFlight` and `BookRentalCar` follow the same pattern.

### Step 3: The Activity

The `TravelAgentActivity` bridges the AI agent and the workflow:

```php
class TravelAgentActivity extends Activity
{
    public function handle($messages)
    {
        BookHotel::$pending = [];
        BookFlight::$pending = [];
        BookRentalCar::$pending = [];

        $history = array_slice($messages, 0, -1);
        $currentUserMessage = end($messages);

        $response = (new TravelAgent())
            ->continue($history)
            ->prompt($currentUserMessage->content);

        $bookings = array_merge(
            BookHotel::$pending,
            BookFlight::$pending,
            BookRentalCar::$pending,
        );

        return json_encode([
            'text' => (string) $response,
            'bookings' => $bookings,
        ]);
    }
}
```

It resets the pending arrays, passes the conversation history to the agent, prompts it with the latest user message, and returns both the AI's text response *and* any booking requests the tools collected. The workflow gets everything it needs in one shot.

## The Workflow: Where It All Comes Together

Here's the complete workflow. (You can also view it on [GitHub](https://github.com/durable-workflow/sample-app/blob/Laravel-12/app/Workflows/Ai/AiWorkflow.php).) Read it top to bottom. It's the entire orchestration layer:

```php
class AiWorkflow extends Workflow
{
    private const INACTIVITY_TIMEOUT = '2 minutes';

    private const MAX_MESSAGES = 20;

    #[SignalMethod]
    public function send(string $message): void
    {
        $this->inbox->receive($message);
    }

    #[UpdateMethod]
    public function receive()
    {
        return $this->outbox->nextUnsent();
    }

    public function handle($injectFailure = null)
    {
        $messages = [];

        try {
            while (count($messages) < self::MAX_MESSAGES) {
                $receivedMessage = yield awaitWithTimeout(
                    self::INACTIVITY_TIMEOUT,
                    fn () => $this->inbox->hasUnread(),
                );

                if (! $receivedMessage) {
                    throw new Exception(
                        'Session ended due to inactivity. Please start a new conversation.'
                    );
                }

                $messages[] = new UserMessage($this->inbox->nextUnread());
                $result = yield activity(TravelAgentActivity::class, $messages);
                $data = json_decode($result, true);

                foreach ($data['bookings'] as $booking) {
                    yield from $this->handleBooking($booking, $injectFailure);
                }

                $messages[] = new AssistantMessage($data['text']);
                $this->outbox->send($data['text']);
            }

            if (count($messages) >= self::MAX_MESSAGES) {
                throw new Exception(
                    'This conversation has reached its message limit. '
                    . 'Please start a new conversation to continue.'
                );
            }

        } catch (Throwable $th) {
            yield from $this->compensate();
            $this->outbox->send(
                $th->getMessage() . ' Any previous bookings have been cancelled.'
            );
        }

        return $messages;
    }

    private function handleBooking(array $data, ?string $injectFailure)
    {
        return match ($data['type']) {
            'book_hotel' => $this->bookHotel($data, $injectFailure),
            'book_flight' => $this->bookFlight($data, $injectFailure),
            'book_rental_car' => $this->bookRentalCar($data, $injectFailure),
        };
    }

    private function bookHotel(array $data, ?string $injectFailure)
    {
        $hotel = yield activity(
            BookHotelActivity::class,
            $data['hotel_name'],
            $data['check_in_date'],
            $data['check_out_date'],
            (int) $data['guests'],
            $injectFailure === 'hotel',
        );
        $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotel));

        return $hotel;
    }

    private function bookFlight(array $data, ?string $injectFailure)
    {
        $flight = yield activity(
            BookFlightActivity::class,
            $data['origin'],
            $data['destination'],
            $data['departure_date'],
            $data['return_date'] ?? null,
            $injectFailure === 'flight',
        );
        $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flight));

        return $flight;
    }

    private function bookRentalCar(array $data, ?string $injectFailure)
    {
        $rentalCar = yield activity(
            BookRentalCarActivity::class,
            $data['pickup_location'],
            $data['pickup_date'],
            $data['return_date'],
            $injectFailure === 'car',
        );
        $this->addCompensation(fn () => activity(CancelRentalCarActivity::class, $rentalCar));

        return $rentalCar;
    }
}
```

There's a lot here. Let's break it down.

### The Inbox / Outbox Pattern

```php
#[SignalMethod]
public function send(string $message): void
{
    $this->inbox->receive($message);
}

#[UpdateMethod]
public function receive()
{
    return $this->outbox->nextUnsent();
}
```

The workflow has two communication channels. The **inbox** receives user messages via `SignalMethod`, fire-and-forget signals that get appended to a durable queue. The **outbox** holds agent responses, retrieved via `UpdateMethod`, synchronous queries that replay the workflow and return the next unsent message.

This is durable messaging. If the server crashes between receiving a user message and processing it, the message is still in the inbox when the workflow resumes. If the agent produces a response but the client disconnects before reading it, it's still in the outbox on the next poll.

### Timeout as Business Logic

```php
$receivedMessage = yield awaitWithTimeout(
    self::INACTIVITY_TIMEOUT,
    fn () => $this->inbox->hasUnread(),
);

if (! $receivedMessage) {
    throw new Exception('Session ended due to inactivity. Please start a new conversation.');
}
```

`awaitWithTimeout` pauses the workflow for up to 2 minutes, waiting for the condition to become true. If the user sends a message, execution continues immediately. If they don't, it returns `false` and we throw an exception to end the conversation.

No cron job. No scheduled command. No database polling. The timeout is expressed *as part of the business logic*, right where it belongs. The framework handles the timer durably. If the server restarts during the 2-minute window, the timer picks up where it left off.

### The Conversation Loop

```php
while (count($messages) < self::MAX_MESSAGES) {
    // Wait for user input (with timeout)
    // Read the message
    // Run the AI agent
    // Process any bookings
    // Send the response
}
```

This reads like pseudocode, but it's the real implementation. Each iteration:

1. **Waits** for a user message (durably, with timeout)
2. **Reads** the next unread message from the inbox
3. **Runs** the AI agent as a durable activity, passing the full conversation history
4. **Processes** any booking requests the agent's tools collected
5. **Sends** the agent's text response to the outbox

The `$messages` array accumulates `UserMessage` and `AssistantMessage` objects as the conversation progresses. It's passed to the agent on every turn so it has full context. And because everything is inside a durable workflow, if the queue worker crashes after step 3 but before step 5, it replays from where it left off.

### The Saga Pattern: Star of the Show

This is where it gets interesting.

```php
private function bookHotel(array $data, ?string $injectFailure)
{
    $hotel = yield activity(
        BookHotelActivity::class,
        $data['hotel_name'],
        $data['check_in_date'],
        $data['check_out_date'],
        (int) $data['guests'],
        $injectFailure === 'hotel',
    );
    $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotel));

    return $hotel;
}
```

After each successful booking, we register a compensation action. `addCompensation` takes a callable that knows *exactly* how to undo what was just done, including the confirmation number, dates, and all the details returned by the booking activity.

If any subsequent step throws an exception, the `catch` block runs:

```php
catch (Throwable $th) {
    yield from $this->compensate();
    $this->outbox->send(
        $th->getMessage() . ' Any previous bookings have been cancelled.'
    );
}
```

`$this->compensate()` executes all registered compensation actions **in reverse order**. If you booked a hotel, then a flight, then a rental car, and the rental car fails, the flight gets cancelled first, then the hotel. (To cancel them in parallel instead, we can set `$this->setParallelCompensation(true)`.)

And notice: the inactivity timeout and message limit are thrown as exceptions too. If a user walks away mid-booking, the `catch` block fires, compensation runs, and all their reservations get cleaned up. Every exit path goes through the same cleanup logic.

## What Just Happened

Let's trace through the actual execution when a user books a hotel and a flight, but the flight fails:

```
You: book Grand Hotel in Paris for 2 guests, check-in 2026-03-01,
     check-out 2026-03-03. Also book a flight NYC to Paris departing
     2026-03-01 returning 2026-03-03.
```

**1. Hotel books successfully**

```
BookHotelActivity ........... RUNNING
Booking hotel: Grand Hotel, Paris, 2026-03-01 to 2026-03-03,
2 guest(s). Confirmation #902928
BookHotelActivity .......... 4.35ms DONE
```

The workflow now has a compensation registered:
```php
fn () => activity(CancelHotelActivity::class, "Hotel booked: Grand Hotel... Confirmation #902928")
```

**2. Flight fails** (injected failure for demo purposes)

```
BookFlightActivity .......... RUNNING
BookFlightActivity ......... 8.37ms FAIL
```

The `NonRetryableException` propagates up to the `catch` block.

**3. Saga compensation kicks in automatically**

```
CancelHotelActivity ......... RUNNING
Cancelling hotel Hotel booked: Grand Hotel, Paris, check-in 2026-03-01,
check-out 2026-03-03, 2 guest(s). Confirmation #902928...
CancelHotelActivity ....... 3.74ms DONE
```

The framework ran the compensation with the *exact* confirmation details from the original booking.

**4. User gets clean feedback**

```
Agent: Flight booking failed: New York to Paris.
       Any previous bookings have been cancelled.
```

The error message is conversational, not a stack trace. The user knows what happened and what was cleaned up.

## Without Sagas?

Consider what you'd need without this pattern:

- **Orphaned hotel booking.** Confirmation #902928 is still reserved, costing real money.
- **Manual cleanup.** Someone has to find and cancel it.
- **Database queries** to figure out which bookings belong to this conversation.
- **Race conditions.** What if the user retries while you're cleaning up?
- **Scattered compensation logic.** Cancel handlers spread across event listeners, with no guarantee they all run.
- **Angry customers and support tickets.** The inevitable result.

With sagas, it's one line per booking:

```php
$this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotel));
```

The framework handles the rest.

## Key Innovations

**Timeouts as business logic.** `awaitWithTimeout('2 minutes', ...)` expresses a timeout right in the workflow code, not as infrastructure configuration. If the user goes idle, the conversation ends gracefully with compensation.

**Conversational error messages.** Every failure path (booking errors, timeouts, message limits) flows through the outbox as a normal message. The user never sees a stack trace or a "Something went wrong" page.

**Automatic cleanup on every exit.** The `try/catch` wrapping the entire conversation loop means *any* exception triggers compensation. The conversation can't end with orphaned bookings, no matter how it ends.

## The Traditional Approach

Let's estimate what this would take with traditional Laravel patterns:

| Concern | Traditional | Durable Workflow |
|---------|-------------|-----------------|
| State tracking | Database table + state machine | Implicit in workflow position |
| Timeout handling | Cron job + stale detection | `awaitWithTimeout()` |
| Failure compensation | Event listeners + manual queries | `addCompensation()` + `compensate()` |
| Crash recovery | Custom retry logic + idempotency | Automatic replay |
| Race conditions | Locks + transactions | Single-threaded workflow execution |
| Cleanup | Scheduled commands + orphan detection | Catch block |
| **Total** | **~500 lines across 10+ files** | **~100 lines in 1 file** |

The traditional approach isn't just more code, it's more *categories* of code. You're writing infrastructure: state machines, cleanup jobs, event wiring, retry logic. With a durable workflow, you're writing business logic: wait for a message, call the agent, book the hotel, compensate on failure.

## Observability

Every message, every activity, every retry, every timeout, every exception, every compensation step, all of it is visible in real time in [Waterline](https://github.com/durable-workflow/waterline).

You can literally scroll through the workflow and see:

- Each user message arriving via a signal
- Each AI turn as a durable activity
- Every booking attempt with inputs and outputs
- The exact moment a failure occurs (and the line it occured on with a stack trace)
- The saga compensation steps, executed automatically in reverse order
- How long each step took, down to the millisecond

## Conclusion

This is a paradigm shift. Instead of building infrastructure to manage state, handle failures, and coordinate distributed operations, you write a function that describes what should happen. The framework provides durability, retry, compensation, and crash recovery.

The entire travel agent (AI conversation, multi-step bookings, saga compensation, inactivity timeouts, message limits, and graceful error handling) is expressed in a single workflow class. Production-grade UX with development-friendly code.

No state machine tables. No cleanup crons. No orphaned bookings. No scattered event listeners. Just a workflow that reads like the business requirements it implements.

### Try It Now in Your Browser

We’ve bundled this workflow into the official Workflow [Sample App](https://github.com/durable-workflow/sample-app/tree/Laravel-12).

To try it:

1. Open the sample-app repo's `Laravel-12` branch on GitHub
2. Click **Code** → **Codespaces** → **Create codespace on Laravel-12**
3. Wait for the environment to build
4. Set your OPENAI_API_KEY in the .env
5. Setup the app and start the queue worker:
   ```bash
   php artisan app:init
   php artisan queue:work
   ```
6. In a second terminal:
```bash
php artisan app:ai
```
Note: You can optionally inject a failure at one of the booking steps by running it with the `--inject-failure` flag e.g. `php artisan app:ai --inject-failure flight`. Valid options are `hotel`, `flight` or `car`.
