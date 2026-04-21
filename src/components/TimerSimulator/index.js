import React, { useState, useEffect, useRef } from 'react';
import styles from './styles.module.css';

const ExecutionState = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
};

export default function TimerSimulator({
  code = `use function Workflow\\V2\\timer;
use Workflow\\V2\\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        timer('5 seconds');

        return 'The workflow waited 5 seconds.';
    }
}`,
  steps = [
    { line: 7, duration: 5000, label: "timer('5 seconds')", showCountdown: true },
    { line: 9, duration: 500, label: "return 'The workflow waited 5 seconds.'", showCountdown: false },
  ],
  title = "Timer Execution Simulator",
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [executionState, setExecutionState] = useState(ExecutionState.IDLE);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const animationRef = useRef(null);
  const stepStartTimeRef = useRef(null);

  const codeLines = code.split('\n');

  const resetSimulation = () => {
    setExecutionState(ExecutionState.IDLE);
    setCurrentStepIndex(-1);
    setProgress(0);
    setCountdown(null);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const runSimulation = () => {
    resetSimulation();
    setExecutionState(ExecutionState.RUNNING);
    setCurrentStepIndex(0);
    stepStartTimeRef.current = performance.now();

    let stepIndex = 0;
    let stepStartTime = performance.now();

    const animate = (timestamp) => {
      if (stepIndex >= steps.length) {
        setExecutionState(ExecutionState.COMPLETED);
        setCurrentStepIndex(-1);
        setProgress(100);
        setCountdown(null);
        return;
      }

      const step = steps[stepIndex];
      const elapsed = timestamp - stepStartTime;
      const stepProgress = Math.min((elapsed / step.duration) * 100, 100);
      
      setProgress(stepProgress);
      setCurrentStepIndex(stepIndex);
      
      // Calculate countdown for timer steps (show remaining seconds)
      const remaining = Math.max(0, step.duration - elapsed);
      setCountdown(Math.ceil(remaining / 1000));

      if (elapsed >= step.duration) {
        stepIndex++;
        stepStartTime = timestamp;
        if (stepIndex < steps.length) {
          setCurrentStepIndex(stepIndex);
        }
      }

      if (stepIndex < steps.length) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setExecutionState(ExecutionState.COMPLETED);
        setCurrentStepIndex(-1);
        setCountdown(null);
      }
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

  const getCurrentStep = () => {
    if (currentStepIndex >= 0 && currentStepIndex < steps.length) {
      return steps[currentStepIndex];
    }
    return null;
  };

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
                disabled={executionState === ExecutionState.RUNNING}
              >
                {executionState === ExecutionState.RUNNING ? '⏳ Running...' : '▶ Play'}
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
                const currentStep = getCurrentStep();
                const isHighlighted = currentStep && currentStep.line === lineNumber;
                
                return (
                  <div
                    key={index}
                    className={`${styles.codeLine} ${isHighlighted ? styles.highlighted : ''}`}
                  >
                    <span className={styles.lineNumber}>{lineNumber}</span>
                    <span className={styles.lineContent}>{line || ' '}</span>
                    {isHighlighted && currentStep.showCountdown && countdown !== null && countdown > 0 && (
                      <span className={styles.countdown}>{countdown}s</span>
                    )}
                  </div>
                );
              })}
            </pre>
          </div>

          {executionState === ExecutionState.RUNNING && getCurrentStep() && getCurrentStep().showCountdown && (
            <div className={styles.progressSection}>
              <div className={styles.progressLabel}>
                Executing: <code>{getCurrentStep().label}</code>
              </div>
              <div className={styles.progressBarContainer}>
                <div
                  className={styles.progressBar}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className={styles.statusBar}>
            <span className={`${styles.statusIndicator} ${styles[executionState]}`}>
              {executionState === ExecutionState.IDLE && '⏸️ Ready'}
              {executionState === ExecutionState.RUNNING && '▶️ Running'}
              {executionState === ExecutionState.COMPLETED && '✅ Completed'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
