import React, { useState, useEffect, useRef } from 'react';
import Translate, {translate} from '@docusaurus/Translate';
import styles from './styles.module.css';

const ActivityStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
};

function ActivityBar({ name, status, progress, duration }) {
  return (
    <div className={styles.activityContainer}>
      <div className={styles.activityHeader}>
        <span className={styles.activityName}>{name}</span>
        <span className={`${styles.activityStatus} ${styles[status]}`}>
          {status === ActivityStatus.PENDING && translate({id: 'simulator.pending', message: '⏳ Pending'})}
          {status === ActivityStatus.RUNNING && translate({id: 'simulator.running', message: '▶️ Running'})}
          {status === ActivityStatus.COMPLETED && translate({id: 'simulator.completed', message: '✅ Completed'})}
        </span>
      </div>
      <div className={styles.progressBarContainer}>
        <div
          className={`${styles.progressBar} ${styles[status]}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className={styles.activityDuration}>
        {status === ActivityStatus.COMPLETED ? `${duration}ms` : status === ActivityStatus.RUNNING ? `${Math.round(progress)}%` : ''}
      </div>
    </div>
  );
}

export default function WorkflowSimulator({ 
  activities = [
    { name: 'MyActivity1', duration: 1500 },
    { name: 'MyActivity2', duration: 2000 },
    { name: 'MyActivity3', duration: 1200 },
  ],
  mode = 'series',
  title = translate({id: 'simulator.series.title', message: 'Series Execution'}),
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [allCompleted, setAllCompleted] = useState(false);
  const [activityStates, setActivityStates] = useState(
    activities.map(() => ({ status: ActivityStatus.PENDING, progress: 0 }))
  );
  const animationRef = useRef(null);
  const startTimeRef = useRef(null);

  const resetSimulation = () => {
    setActivityStates(activities.map(() => ({ status: ActivityStatus.PENDING, progress: 0 })));
    setIsRunning(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const runSeriesSimulation = () => {
    resetSimulation();
    setIsRunning(true);
    startTimeRef.current = performance.now();

    let currentActivityIndex = 0;
    let activityStartTime = startTimeRef.current;

    const animate = (timestamp) => {
      if (currentActivityIndex >= activities.length) {
        setIsRunning(false);
        return;
      }

      const activity = activities[currentActivityIndex];
      const elapsed = timestamp - activityStartTime;
      const progress = Math.min((elapsed / activity.duration) * 100, 100);

      setActivityStates(prev => {
        const newStates = [...prev];
        // Mark previous activities as completed
        for (let i = 0; i < currentActivityIndex; i++) {
          newStates[i] = { status: ActivityStatus.COMPLETED, progress: 100 };
        }
        // Update current activity
        newStates[currentActivityIndex] = {
          status: progress >= 100 ? ActivityStatus.COMPLETED : ActivityStatus.RUNNING,
          progress: progress,
        };
        return newStates;
      });

      if (progress >= 100) {
        currentActivityIndex++;
        activityStartTime = timestamp;
      }

      if (currentActivityIndex < activities.length) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsRunning(false);
        setAllCompleted(true);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  const runParallelSimulation = () => {
    resetSimulation();
    setIsRunning(true);
    startTimeRef.current = performance.now();

    const animate = (timestamp) => {
      const elapsed = timestamp - startTimeRef.current;
      let allDone = true;

      setActivityStates(prev => {
        return activities.map((activity, index) => {
          const progress = Math.min((elapsed / activity.duration) * 100, 100);
          if (progress < 100) allDone = false;
          return {
            status: progress >= 100 ? ActivityStatus.COMPLETED : ActivityStatus.RUNNING,
            progress: progress,
          };
        });
      });

      if (!allDone) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsRunning(false);
        setAllCompleted(true);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  // Mix mode: runs activities based on their 'group' and 'subgroup' properties
  // Activities in the same group run together, subgroups within a group run in series
  // group: which phase (0, 1, 2 = sequential phases)
  // subgroup: within a group, activities with same subgroup run in parallel, different subgroups run in series
  const runMixSimulation = () => {
    resetSimulation();
    setIsRunning(true);
    
    // Group activities by their group number
    const groups = {};
    activities.forEach((activity, index) => {
      const group = activity.group ?? index;
      if (!groups[group]) groups[group] = [];
      groups[group].push({ ...activity, originalIndex: index });
    });
    
    const groupKeys = Object.keys(groups).sort((a, b) => a - b);
    let currentGroupIndex = 0;
    let groupStartTime = performance.now();
    
    // Track cumulative time spent on completed activities in each subgroup
    const subgroupCompletedTime = {};

    const animate = (timestamp) => {
      if (currentGroupIndex >= groupKeys.length) {
        setIsRunning(false);
        return;
      }

      const currentGroup = groups[groupKeys[currentGroupIndex]];
      const elapsed = timestamp - groupStartTime;
      
      // Check if all activities in current group are complete
      let groupComplete = true;
      
      setActivityStates(prev => {
        const newStates = [...prev];
        
        // Mark all previous groups as completed
        for (let i = 0; i < currentGroupIndex; i++) {
          const prevGroup = groups[groupKeys[i]];
          prevGroup.forEach(activity => {
            newStates[activity.originalIndex] = { status: ActivityStatus.COMPLETED, progress: 100 };
          });
        }
        
        // Separate activities with subgroups from those without
        const withSubgroups = {};
        const withoutSubgroups = [];
        
        currentGroup.forEach(activity => {
          if (activity.subgroup !== undefined) {
            if (!withSubgroups[activity.subgroup]) withSubgroups[activity.subgroup] = [];
            withSubgroups[activity.subgroup].push(activity);
          } else {
            withoutSubgroups.push(activity);
          }
        });
        
        // Handle activities without subgroups (parallel)
        withoutSubgroups.forEach(activity => {
          const progress = Math.min((elapsed / activity.duration) * 100, 100);
          if (progress < 100) groupComplete = false;
          newStates[activity.originalIndex] = {
            status: progress >= 100 ? ActivityStatus.COMPLETED : ActivityStatus.RUNNING,
            progress: progress,
          };
        });
        
        // Handle subgroups (series within the group)
        Object.keys(withSubgroups).forEach(subgroupKey => {
          const subgroupActivities = withSubgroups[subgroupKey];
          const trackKey = `${currentGroupIndex}-${subgroupKey}`;
          
          // Initialize cumulative completed time for this subgroup
          if (subgroupCompletedTime[trackKey] === undefined) {
            subgroupCompletedTime[trackKey] = 0;
          }
          
          // Calculate which activity is currently running based on elapsed time
          let remainingTime = elapsed;
          let currentActivityIndex = 0;
          
          // Find which activity should be running
          for (let i = 0; i < subgroupActivities.length; i++) {
            if (remainingTime >= subgroupActivities[i].duration) {
              remainingTime -= subgroupActivities[i].duration;
              currentActivityIndex = i + 1;
            } else {
              break;
            }
          }
          
          // Update states for all activities in this subgroup
          for (let i = 0; i < subgroupActivities.length; i++) {
            const activity = subgroupActivities[i];
            
            if (i < currentActivityIndex) {
              // Already completed
              newStates[activity.originalIndex] = { status: ActivityStatus.COMPLETED, progress: 100 };
            } else if (i === currentActivityIndex) {
              // Currently running
              const progress = Math.min((remainingTime / activity.duration) * 100, 100);
              newStates[activity.originalIndex] = {
                status: progress >= 100 ? ActivityStatus.COMPLETED : ActivityStatus.RUNNING,
                progress: progress,
              };
              if (progress < 100) groupComplete = false;
            } else {
              // Not started yet
              newStates[activity.originalIndex] = { status: ActivityStatus.PENDING, progress: 0 };
              groupComplete = false;
            }
          }
        });
        
        return newStates;
      });

      if (groupComplete) {
        currentGroupIndex++;
        groupStartTime = timestamp;
      }

      if (currentGroupIndex < groupKeys.length) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Final update to mark everything complete
        setActivityStates(prev => prev.map(() => ({ status: ActivityStatus.COMPLETED, progress: 100 })));
        setIsRunning(false);
        setAllCompleted(true);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  const handlePlay = () => {
    if (mode === 'series') {
      runSeriesSimulation();
    } else if (mode === 'mix') {
      runMixSimulation();
    } else {
      runParallelSimulation();
    }
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Reset states when activities prop changes
    setActivityStates(activities.map(() => ({ status: ActivityStatus.PENDING, progress: 0 })));
  }, [activities]);

  return (
    <div className={styles.simulatorWrapper}>
      <button
        className={`${styles.expandButton} ${isExpanded ? styles.expanded : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
        <span><Translate id="simulator.try">Try it out!</Translate></span>
      </button>
      
      {isExpanded && (
        <div className={styles.simulatorContainer}>
          <div className={styles.simulatorHeader}>
            <h4 className={styles.simulatorTitle}>{title}</h4>
            <div className={styles.controls}>
              <button
                className={styles.playButton}
                onClick={handlePlay}
                disabled={isRunning}
              >
                {isRunning ? translate({id: 'simulator.runningHourglass', message: '⏳ Running...'}) : translate({id: 'simulator.play', message: '▶ Play'})}
              </button>
              <button
                className={styles.resetButton}
                onClick={resetSimulation}
                disabled={isRunning}
              >
                <Translate id="simulator.reset">🔄 Reset</Translate>
              </button>
            </div>
          </div>
          
          <div className={styles.activitiesContainer}>
            {activities.map((activity, index) => (
              <ActivityBar
                key={index}
                name={activity.name}
                status={activityStates[index]?.status || ActivityStatus.PENDING}
                progress={activityStates[index]?.progress || 0}
                duration={activity.duration}
              />
            ))}
          </div>
          
          <div className={styles.statusBar}>
            <span className={`${styles.statusIndicator} ${isRunning ? styles.running : allCompleted ? styles.completed : styles.idle}`}>
              {isRunning ? translate({id: 'simulator.running', message: '▶️ Running'}) : allCompleted ? translate({id: 'simulator.completed', message: '✅ Completed'}) : translate({id: 'simulator.ready', message: '⏸️ Ready'})}
            </span>
            <span className={styles.modeIndicator}>
              <Translate id="simulator.mode">Mode:</Translate>{' '}<strong>{mode === 'series' ? translate({id: 'simulator.mode.series', message: 'Series'}) : mode === 'mix' ? translate({id: 'simulator.mode.mix', message: 'Mix'}) : translate({id: 'simulator.mode.parallel', message: 'Parallel'})}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
