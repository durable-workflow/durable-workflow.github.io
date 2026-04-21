import React, { useState, useEffect, useRef } from 'react';
import styles from './styles.module.css';

const ExecutionState = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

const codeWithHeartbeat = `use Workflow\\V2\\Activity;

class MyActivity extends Activity
{
    public $timeout = 5;

    public function handle(): void
    {
      while (true) {
        sleep(1);

        $this->heartbeat();
      }
    }
}`;

const codeWithoutHeartbeat = `use Workflow\\V2\\Activity;

class MyActivity extends Activity
{
    public $timeout = 5;

    public function handle(): void
    {
      while (true) {
        sleep(1);

        // No heartbeat!
      }
    }
}`;

export default function HeartbeatSimulator({
  title = "Heartbeat Simulator",
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [withHeartbeat, setWithHeartbeat] = useState(true);
  const [executionState, setExecutionState] = useState(ExecutionState.IDLE);
  const [currentLine, setCurrentLine] = useState(-1);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [loopCount, setLoopCount] = useState(0);
  const [lastHeartbeat, setLastHeartbeat] = useState(0);
  const animationRef = useRef(null);
  const startTimeRef = useRef(null);
  const loopStartTimeRef = useRef(null);

  const code = withHeartbeat ? codeWithHeartbeat : codeWithoutHeartbeat;
  const codeLines = code.split('\n');

  const resetSimulation = () => {
    setExecutionState(ExecutionState.IDLE);
    setCurrentLine(-1);
    setElapsedTime(0);
    setLoopCount(0);
    setLastHeartbeat(0);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const stopSimulation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setExecutionState(ExecutionState.COMPLETED);
    setCurrentLine(-1);
  };

  const runSimulation = () => {
    resetSimulation();
    setExecutionState(ExecutionState.RUNNING);
    startTimeRef.current = performance.now();
    loopStartTimeRef.current = performance.now();
    
    let currentLoopCount = 0;
    let lastHeartbeatTime = 0;
    let loopPhase = 0; // 0 = sleep(1), 1 = heartbeat line
    let phaseStartTime = performance.now();

    const animate = (timestamp) => {
      const totalElapsed = (timestamp - startTimeRef.current) / 1000;
      setElapsedTime(totalElapsed);

      // Check for timeout (5 seconds since last heartbeat)
      const timeSinceHeartbeat = totalElapsed - lastHeartbeatTime;
      
      if (timeSinceHeartbeat >= 5) {
        // Timeout!
        setExecutionState(ExecutionState.FAILED);
        setCurrentLine(-1);
        return;
      }

      const phaseElapsed = timestamp - phaseStartTime;

      if (loopPhase === 0) {
        // sleep(1) phase - takes 1 second
        setCurrentLine(10); // sleep(1) line
        
        if (phaseElapsed >= 1000) {
          loopPhase = 1;
          phaseStartTime = timestamp;
        }
      } else {
        // heartbeat line phase - quick
        setCurrentLine(12); // $this->heartbeat() or comment line
        
        if (phaseElapsed >= 200) {
          if (withHeartbeat) {
            // Reset heartbeat timer
            lastHeartbeatTime = totalElapsed;
            setLastHeartbeat(totalElapsed);
          }
          
          // Start new loop
          currentLoopCount++;
          setLoopCount(currentLoopCount);
          loopPhase = 0;
          phaseStartTime = timestamp;
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Reset when switching modes
    resetSimulation();
  }, [withHeartbeat]);

  const timeSinceHeartbeat = elapsedTime - lastHeartbeat;
  const timeoutProgress = Math.min((timeSinceHeartbeat / 5) * 100, 100);

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
              {executionState === ExecutionState.RUNNING ? (
                <button
                  className={styles.stopButton}
                  onClick={stopSimulation}
                >
                  ⏹ Stop
                </button>
              ) : (
                <button
                  className={styles.playButton}
                  onClick={runSimulation}
                >
                  ▶ Play
                </button>
              )}
              <button
                className={styles.resetButton}
                onClick={resetSimulation}
                disabled={executionState === ExecutionState.RUNNING}
              >
                🔄 Reset
              </button>
            </div>
          </div>

          <div className={styles.modeSelector}>
            <button
              className={`${styles.modeButton} ${withHeartbeat ? styles.active : ''}`}
              onClick={() => setWithHeartbeat(true)}
              disabled={executionState === ExecutionState.RUNNING}
            >
              With Heartbeat
            </button>
            <button
              className={`${styles.modeButton} ${!withHeartbeat ? styles.active : ''}`}
              onClick={() => setWithHeartbeat(false)}
              disabled={executionState === ExecutionState.RUNNING}
            >
              Without Heartbeat
            </button>
          </div>

          <div className={styles.codeContainer}>
            <pre className={styles.codeBlock}>
              {codeLines.map((line, index) => {
                const lineNumber = index + 1;
                const isHighlighted = currentLine === lineNumber;
                
                return (
                  <div
                    key={index}
                    className={`${styles.codeLine} ${isHighlighted ? styles.highlighted : ''}`}
                  >
                    <span className={styles.lineNumber}>{lineNumber}</span>
                    <span className={styles.lineContent}>{line || ' '}</span>
                  </div>
                );
              })}
            </pre>
          </div>

          {executionState === ExecutionState.RUNNING && (
            <div className={styles.statsSection}>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Loop iterations:</span>
                <span className={styles.statValue}>{loopCount}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Total time:</span>
                <span className={styles.statValue}>{elapsedTime.toFixed(1)}s</span>
              </div>
              <div className={styles.timeoutSection}>
                <div className={styles.timeoutLabel}>
                  Time since last heartbeat: <strong>{timeSinceHeartbeat.toFixed(1)}s</strong> / 5s timeout
                </div>
                <div className={styles.timeoutBarContainer}>
                  <div
                    className={`${styles.timeoutBar} ${timeoutProgress > 80 ? styles.danger : ''}`}
                    style={{ width: `${timeoutProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className={styles.statusBar}>
            <span className={`${styles.statusIndicator} ${styles[executionState]}`}>
              {executionState === ExecutionState.IDLE && '⏸️ Ready'}
              {executionState === ExecutionState.RUNNING && '▶️ Running'}
              {executionState === ExecutionState.COMPLETED && '✅ Completed'}
              {executionState === ExecutionState.FAILED && '❌ Timeout - No Heartbeat!'}
            </span>
            {executionState === ExecutionState.RUNNING && withHeartbeat && (
              <span className={styles.heartbeatIndicator}>
                💓 Heartbeat active
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
