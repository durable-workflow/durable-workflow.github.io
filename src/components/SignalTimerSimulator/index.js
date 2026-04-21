import React, { useState, useEffect, useRef } from 'react';
import styles from './styles.module.css';

const ExecutionState = {
  IDLE: 'idle',
  RUNNING: 'running',
  WAITING: 'waiting',
  COMPLETED: 'completed',
};

export default function SignalTimerSimulator({
  code = `use Workflow\\V2\\Attributes\\Signal;
use Workflow\\V2\\Workflow;
use function Workflow\\V2\\await;
use function Workflow\\V2\\minutes;

#[Signal('ready')]
class MyWorkflow extends Workflow
{
    public function handle(): bool
    {
        $result = await('ready', timeout: minutes(5));

        return $result !== null;
    }
}`,
  timeoutDuration = 300, // 5 minutes in seconds
  title = "Signal + Timer Simulator",
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [executionState, setExecutionState] = useState(ExecutionState.IDLE);
  const [currentLine, setCurrentLine] = useState(-1);
  const [timeRemaining, setTimeRemaining] = useState(timeoutDuration);
  const [result, setResult] = useState(null);
  const [signalReceived, setSignalReceived] = useState(false);
  const timerIntervalRef = useRef(null);
  const animationRef = useRef(null);

  const codeLines = code.split('\n');

  const resetSimulation = () => {
    setExecutionState(ExecutionState.IDLE);
    setCurrentLine(-1);
    setTimeRemaining(timeoutDuration);
    setResult(null);
    setSignalReceived(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const runSimulation = () => {
    resetSimulation();
    setExecutionState(ExecutionState.WAITING);
    setCurrentLine(10); // await with timeout line
    setTimeRemaining(timeoutDuration);
    
    // Start countdown timer
    const startTime = Date.now();
    timerIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, timeoutDuration - elapsed);
      setTimeRemaining(remaining);
      
      if (remaining <= 0) {
        // Timeout reached without signal
        clearInterval(timerIntervalRef.current);
        completeWithResult(false);
      }
    }, 100);
  };

  const completeWithResult = (receivedSignal) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    
    setSignalReceived(receivedSignal);
    setResult(receivedSignal);
    
    if (receivedSignal) {
      // Show signal handler briefly
      setCurrentLine(12); // $this->ready = $ready line
      setExecutionState(ExecutionState.RUNNING);
      
      setTimeout(() => {
        setCurrentLine(17); // Back to awaitWithTimeout
        setTimeout(() => {
          setExecutionState(ExecutionState.COMPLETED);
          setCurrentLine(-1);
        }, 500);
      }, 300);
    } else {
      // Timeout - just complete
      setExecutionState(ExecutionState.RUNNING);
      setTimeout(() => {
        setExecutionState(ExecutionState.COMPLETED);
        setCurrentLine(-1);
      }, 500);
    }
  };

  const sendSignal = () => {
    if (executionState !== ExecutionState.WAITING) return;
    completeWithResult(true);
  };

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const progressPercent = ((timeoutDuration - timeRemaining) / timeoutDuration) * 100;

  return (
    <div className={styles.simulatorWrapper}>
      <button
        className={`${styles.expandButton} ${isExpanded ? styles.expanded : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
        <span>Try it out!</span>
      </button>

      {isExpanded && (
        <div className={styles.simulatorContainer}>
          <div className={styles.simulatorHeader}>
            <h4 className={styles.simulatorTitle}>{title}</h4>
            <div className={styles.controls}>
              <button
                className={styles.playButton}
                onClick={runSimulation}
                disabled={executionState === ExecutionState.RUNNING || executionState === ExecutionState.WAITING}
              >
                {executionState === ExecutionState.RUNNING ? '⏳ Running...' : 
                 executionState === ExecutionState.WAITING ? '⏸️ Waiting...' : '▶ Play'}
              </button>
              <button
                className={styles.resetButton}
                onClick={resetSimulation}
                disabled={executionState === ExecutionState.RUNNING}
              >
                🔄 Reset
              </button>
            </div>
          </div>

          <div className={styles.codeContainer}>
            <pre className={styles.codeBlock}>
              {codeLines.map((line, index) => {
                const lineNumber = index + 1;
                const isHighlighted = currentLine === lineNumber;
                const isWaitingLine = isHighlighted && executionState === ExecutionState.WAITING;
                
                return (
                  <div
                    key={index}
                    className={`${styles.codeLine} ${isHighlighted ? styles.highlighted : ''} ${isWaitingLine ? styles.waiting : ''}`}
                  >
                    <span className={styles.lineNumber}>{lineNumber}</span>
                    <span className={styles.lineContent}>{line || ' '}</span>
    {isWaitingLine && (
                      <span className={styles.countdown}>{formatTime(timeRemaining)}</span>
                    )}
                  </div>
                );
              })}
            </pre>
          </div>

          {executionState === ExecutionState.WAITING && (
            <div className={styles.waitingSection}>
              <div className={styles.timerProgress}>
                <div className={styles.timerLabel}>
                  Timeout in: <strong>{formatTime(timeRemaining)}</strong>
                </div>
                <div className={styles.timerBarContainer}>
                  <div
                    className={styles.timerBar}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
              <div className={styles.signalSection}>
                <button
                  className={styles.signalButton}
                  onClick={sendSignal}
                >
                  📤 Send Signal: <code>setReady(true)</code>
                </button>
              </div>
            </div>
          )}

          <div className={styles.statusBar}>
            <span className={`${styles.statusIndicator} ${styles[executionState]}`}>
              {executionState === ExecutionState.IDLE && '⏸️ Ready'}
              {executionState === ExecutionState.RUNNING && '▶️ Running'}
              {executionState === ExecutionState.WAITING && '⏳ Waiting for Signal or Timeout'}
              {executionState === ExecutionState.COMPLETED && '✅ Completed'}
            </span>
            {result !== null && (
              <span className={styles.resultDisplay}>
                $result = <code className={result ? styles.resultTrue : styles.resultFalse}>
                  {result ? 'true' : 'false'}
                </code>
                <span className={styles.resultExplanation}>
                  ({result ? 'signal received' : 'timeout reached'})
                </span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
