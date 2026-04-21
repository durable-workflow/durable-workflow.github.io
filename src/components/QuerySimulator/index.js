import React, { useState, useEffect, useRef } from 'react';
import styles from './styles.module.css';

const ExecutionState = {
  IDLE: 'idle',
  RUNNING: 'running',
  WAITING: 'waiting',
  COMPLETED: 'completed',
};

export default function QuerySimulator({
  code = `use Workflow\\QueryMethod;
use Workflow\\V2\\Attributes\\Signal;
use Workflow\\V2\\Workflow;
use function Workflow\\V2\\await;

#[Signal('ready')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[QueryMethod]
    public function getReady(): bool
    {
        return $this->ready;
    }

    public function handle(): void
    {
        $this->ready = await('ready') === true;
    }
}`,
  title = "Query & Signal Simulator",
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [executionState, setExecutionState] = useState(ExecutionState.IDLE);
  const [currentLine, setCurrentLine] = useState(-1);
  const [waitingTime, setWaitingTime] = useState(0);
  const [readyValue, setReadyValue] = useState(false);
  const [queryResult, setQueryResult] = useState(null);
  const [queryFlash, setQueryFlash] = useState(false);
  const waitingIntervalRef = useRef(null);
  const animationRef = useRef(null);

  const codeLines = code.split('\n');

  const resetSimulation = () => {
    setExecutionState(ExecutionState.IDLE);
    setCurrentLine(-1);
    setWaitingTime(0);
    setReadyValue(false);
    setQueryResult(null);
    setQueryFlash(false);
    if (waitingIntervalRef.current) {
      clearInterval(waitingIntervalRef.current);
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const runSimulation = () => {
    resetSimulation();
    setExecutionState(ExecutionState.WAITING);
    setCurrentLine(18); // await line
    
    // Start counting waiting time
    const startTime = Date.now();
    waitingIntervalRef.current = setInterval(() => {
      setWaitingTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
  };

  const sendSignal = () => {
    if (executionState !== ExecutionState.WAITING) return;
    
    // Clear waiting interval
    if (waitingIntervalRef.current) {
      clearInterval(waitingIntervalRef.current);
    }
    
    // Flash the line that receives the durable signal value.
    setCurrentLine(18); // $this->ready = await('ready') === true
    setReadyValue(true);
    setExecutionState(ExecutionState.RUNNING);
    
    setTimeout(() => {
      setCurrentLine(24); // Back to await line briefly
      setTimeout(() => {
        setExecutionState(ExecutionState.COMPLETED);
        setCurrentLine(-1);
      }, 500);
    }, 300);
  };

  const queryWorkflow = () => {
    // Flash the query method
    setQueryFlash(true);
    setQueryResult(readyValue);
    
    setTimeout(() => {
      setQueryFlash(false);
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (waitingIntervalRef.current) {
        clearInterval(waitingIntervalRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

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
                const isQueryLine = queryFlash && (lineNumber >= 10 && lineNumber <= 14);
                
                return (
                  <div
                    key={index}
                    className={`${styles.codeLine} ${isHighlighted ? styles.highlighted : ''} ${isWaitingLine ? styles.waiting : ''} ${isQueryLine ? styles.queryHighlight : ''}`}
                  >
                    <span className={styles.lineNumber}>{lineNumber}</span>
                    <span className={styles.lineContent}>{line || ' '}</span>
                    {isWaitingLine && (
                      <span className={styles.waitingBadge}>{waitingTime}s</span>
                    )}
                  </div>
                );
              })}
            </pre>
          </div>

          <div className={styles.actionsRow}>
            {(executionState === ExecutionState.WAITING || executionState === ExecutionState.COMPLETED) && (
              <div className={styles.querySection}>
                <button
                  className={styles.queryButton}
                  onClick={queryWorkflow}
                >
                  🔍 Query: <code>getReady()</code>
                </button>
                {queryResult !== null && (
                  <span className={styles.queryResultInline}>
                    → <code>{queryResult ? 'true' : 'false'}</code>
                  </span>
                )}
              </div>
            )}

            {executionState === ExecutionState.WAITING && (
              <div className={styles.signalSection}>
                <button
                  className={styles.signalButton}
                  onClick={sendSignal}
                >
                  📤 Send Signal: <code>setReady(true)</code>
                </button>
              </div>
            )}
          </div>

          <div className={styles.statusBar}>
            <span className={`${styles.statusIndicator} ${styles[executionState]}`}>
              {executionState === ExecutionState.IDLE && '⏸️ Ready'}
              {executionState === ExecutionState.RUNNING && '▶️ Running'}
              {executionState === ExecutionState.WAITING && '⏳ Waiting for Signal'}
              {executionState === ExecutionState.COMPLETED && '✅ Completed'}
            </span>
            <span className={styles.stateDisplay}>
              $ready = <code>{readyValue ? 'true' : 'false'}</code>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
