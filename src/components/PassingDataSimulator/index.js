import React, { useState, useEffect, useRef } from 'react';
import styles from './styles.module.css';

const ExecutionState = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
};

const workflowCode = `use function Workflow\\V2\\activity;
use Workflow\\V2\\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(string $name): string
    {
        $result = activity(MyActivity::class, $name);

        return $result;
    }
}`;

const activityCode = `use Workflow\\V2\\Activity;

class MyActivity extends Activity
{
    public function handle(string $name): string
    {
        return "Hello, {$name}!";
    }
}`;

export default function PassingDataSimulator({
  title = "Hello World Simulator",
  inputValue = "world",
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [executionState, setExecutionState] = useState(ExecutionState.IDLE);
  const [currentFile, setCurrentFile] = useState('workflow'); // 'workflow' or 'activity'
  const [currentLine, setCurrentLine] = useState(-1);
  const [output, setOutput] = useState(null);
  const [passedValue, setPassedValue] = useState(null);
  const animationRef = useRef(null);

  const code = currentFile === 'workflow' ? workflowCode : activityCode;
  const codeLines = code.split('\n');

  const resetSimulation = () => {
    setExecutionState(ExecutionState.IDLE);
    setCurrentFile('workflow');
    setCurrentLine(-1);
    setOutput(null);
    setPassedValue(null);
    if (animationRef.current) {
      clearTimeout(animationRef.current);
    }
  };

  const runSimulation = async () => {
    resetSimulation();
    setExecutionState(ExecutionState.RUNNING);
    
    // Step 1: Workflow handle() receives $name
    setCurrentFile('workflow');
    setCurrentLine(5); // public function handle(string $name): string
    setPassedValue(inputValue);
    await delay(800);
    
    // Step 2: activity call
    setCurrentLine(7); // $result = activity(...)
    await delay(1000);
    
    // Step 3: Switch to activity - clear line first to prevent flash
    setCurrentLine(-1);
    await delay(50); // Small delay to ensure render completes
    setCurrentFile('activity');
    setCurrentLine(4); // public function handle(string $name): string
    await delay(800);
    
    // Step 4: Activity returns
    setCurrentLine(6); // return "Hello, {$name}!";
    await delay(1000);
    
    // Step 5: Back to workflow - clear line first to prevent flash
    setCurrentLine(-1);
    await delay(50); // Small delay to ensure render completes
    setCurrentFile('workflow');
    setCurrentLine(9); // return $result;
    await delay(800);
    
    // Complete
    setOutput(`Hello, ${inputValue}!`);
    setExecutionState(ExecutionState.COMPLETED);
    setCurrentLine(-1);
  };

  const delay = (ms) => new Promise(resolve => {
    animationRef.current = setTimeout(resolve, ms);
  });

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
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
                disabled={executionState === ExecutionState.RUNNING}
              >
                {executionState === ExecutionState.RUNNING ? '▶️ Running...' : '▶ Play'}
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

          <div className={styles.fileTabs}>
            <button
              className={`${styles.fileTab} ${currentFile === 'workflow' ? styles.active : ''}`}
              onClick={() => executionState !== ExecutionState.RUNNING && setCurrentFile('workflow')}
            >
              MyWorkflow.php
            </button>
            <button
              className={`${styles.fileTab} ${currentFile === 'activity' ? styles.active : ''}`}
              onClick={() => executionState !== ExecutionState.RUNNING && setCurrentFile('activity')}
            >
              MyActivity.php
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

          {passedValue !== null && executionState === ExecutionState.RUNNING && (
            <div className={styles.dataFlow}>
              <span className={styles.dataLabel}>$name =</span>
              <code className={styles.dataValue}>'{passedValue}'</code>
            </div>
          )}

          {output !== null && (
            <div className={styles.outputSection}>
              <span className={styles.outputLabel}>Output:</span>
              <code className={styles.outputValue}>'{output}'</code>
            </div>
          )}

          <div className={styles.statusBar}>
            <span className={`${styles.statusIndicator} ${styles[executionState]}`}>
              {executionState === ExecutionState.IDLE && '⏸️ Ready'}
              {executionState === ExecutionState.RUNNING && '▶️ Running'}
              {executionState === ExecutionState.COMPLETED && '✅ Completed'}
            </span>
            {executionState === ExecutionState.RUNNING && (
              <span className={styles.currentFileIndicator}>
                Executing: <strong>{currentFile === 'workflow' ? 'MyWorkflow' : 'MyActivity'}</strong>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
