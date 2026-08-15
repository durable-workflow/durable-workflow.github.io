import React from 'react';
import styles from './styles.module.css';

export default function ThemedImage({
  lightSrc,
  darkSrc,
  alt = '',
  lightLink,
  darkLink,
  diagramId,
}) {
  return (
    <div className={styles.themedImageWrapper} data-diagram-id={diagramId}>
      <div className={styles.lightImage}>
        {lightLink ? (
          <a href={lightLink} target="_blank" rel="noopener noreferrer">
            <img src={lightSrc} alt={alt} />
          </a>
        ) : (
          <img src={lightSrc} alt={alt} />
        )}
      </div>
      <div className={styles.darkImage}>
        {darkLink ? (
          <a href={darkLink} target="_blank" rel="noopener noreferrer">
            <img src={darkSrc} alt={alt} />
          </a>
        ) : (
          <img src={darkSrc} alt={alt} />
        )}
      </div>
    </div>
  );
}
