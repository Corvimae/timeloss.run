import React, { useCallback, useState } from 'react';
import styled from 'styled-components';
import { useDropzone } from 'react-dropzone';
import { parse, differenceInMilliseconds, formatDuration, intervalToDuration } from 'date-fns';

function formatMillisecondDuration(totalMilliseconds: number): string {
  return formatDuration(intervalToDuration({ start: 0, end: totalMilliseconds}), { delimiter: ', ' }).replace(/,([^,]*)$/, ' and $1')
}

function determineRunDeathPoints(document: Document): Record<number, Element> {
  const lastSplits = [...document.querySelectorAll('Segment')].reduce<Record<number, Element>>((acc, segment) => {
    return [...segment.querySelectorAll('SegmentHistory Time')]
      .map(time => Number(time.getAttribute('id')))
      .reduce((innerAcc, id) => ({ ...innerAcc, [id]: segment }), acc);
  }, {});

  return Object.entries(lastSplits).reduce<Record<number, Element>>((acc, [id, split]) => ({
    ...acc,
    [id]: split.nextElementSibling,
  }), {});
}

export default function Home() {
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const onDrop = useCallback(acceptedFiles => {
    if (acceptedFiles.length) {
      const [file] = acceptedFiles;
      const reader = new FileReader();

      reader.addEventListener('load', event => {
        try {
          const parser = new DOMParser();
        
          const document = parser.parseFromString(event.target.result as string, 'application/xml');

          const baseDate = new Date();
          const attempts = [...document.querySelectorAll('Attempt')];
          const runDurations = attempts.map(attempt => [differenceInMilliseconds(
            parse(attempt.getAttribute('ended'), 'MM/dd/yyyy HH:mm:ss', baseDate),
            parse(attempt.getAttribute('started'), 'MM/dd/yyyy HH:mm:ss', baseDate),
          ), attempt]) as [number, Element][];

          const totalAttemptDuration = runDurations.reduce((acc, [attemptDuration]) => acc + attemptDuration, 0);
          const longestAttemptDuration = Math.max(...runDurations.map(([duration]) => duration));
          const completedAttemptDurations = runDurations
            .filter(([_, attempt]) => attempt.querySelector('GameTime') || attempt.querySelector('RealTime'));
          
          const pbDuration = Math.min(...completedAttemptDurations.map(([duration]) => duration));

          const deathPoints = determineRunDeathPoints(document);

          const splitNamesToDeathCounts = Object.values(deathPoints).reduce<Record<string, number>>((acc, element) => {
            const splitName = element?.querySelector('Name').textContent.trim() ?? '<<undefined>>';

            return {
              ...acc,
              [splitName]: (acc[splitName] ?? 0) + 1,
            }
          }, {});

          const deathsBeforeFirstSplit = attempts.length - Object.values(splitNamesToDeathCounts).reduce<number>((acc, value) => acc + value, 0);
          const splitWithMostDeaths = Object.entries(splitNamesToDeathCounts).reduce<[string, number]>(([accName, accCount], [name, count]) => {
            console.log(name, count);
            if (name !== '<<undefined>>' && count > accCount) return [name, count];

            return [accName, accCount];
          }, ['', 0]);

          setResults({
            attemptCount: attempts.length,
            completedRunCount: completedAttemptDurations.length,
            totalAttemptDuration,
            deathsBeforeFirstSplit,
            deathsBeforeFirstSplitPercentage: Math.floor(deathsBeforeFirstSplit / attempts.length * 100),
            splitWithMostDeaths,
            splitWithMostDeathsPercentage: Math.floor(Math.max(deathsBeforeFirstSplit, splitWithMostDeaths[1]) / attempts.length * 100),
            splitNamesToDeathCounts,
            firstSplitName: document.querySelector('Segment Name').textContent,
            completedRunPercentage: Math.floor(completedAttemptDurations.length / attempts.length * 100),
            humanizedTotalDuration: formatMillisecondDuration(totalAttemptDuration),
            humanizedAverageDuration: formatMillisecondDuration(Math.floor(totalAttemptDuration / attempts.length)),
            humanizedLongestDuration: formatMillisecondDuration(longestAttemptDuration),
            humanizedPBDuration: formatMillisecondDuration(pbDuration),
          });
        } catch (error) {
          setError(`uh oh. ${error}`);
        }
      });
      
      reader.readAsText(file);
      
    } else {
      setError('invalid file.');
    }
  }, []);

  const { getRootProps, getInputProps, } = useDropzone({ onDrop });

  return (
   <Container {...getRootProps()}>
      <input {...getInputProps()} />
      <Header>timeloss.run</Header>
      <Subheader>life is short. how much of it did you spend resetting?</Subheader>
      {!results && (
        <>
          <DragInstructions>
            drag your livesplit file anywhere on the page to get started.
          </DragInstructions>
          {error && (
            <UploadError>{error}</UploadError>
          )}
        </>
      )}

      {results && (
        <Results>
          <ResultItem>
            you've been running this game for {results.humanizedTotalDuration}
            <HelpText>
              and that's just with livesplit running...
            </HelpText>
          </ResultItem>

          <ResultItem>
            your average run lasted {results.humanizedAverageDuration}
            <HelpText>
              the longest was {results.humanizedLongestDuration}. did you leave the timer running?
            </HelpText>
          </ResultItem>

          <ResultItem>
            {results.completedRunPercentage}% of your runs finished ({results.completedRunCount} of {results.attemptCount})
            {results.completedRunPercentage >= 75 && (
              <HelpText>must be nice</HelpText>
            )}
            {results.completedRunPercentage >= 25 && results.completedRunPercentage < 75 && (
              <HelpText>could be worse</HelpText>
            )}
            {results.completedRunPercentage >= 5 && results.completedRunPercentage < 25 && (
              <HelpText>every day you wake up and choose resets </HelpText>
            )}
            {results.completedRunPercentage < 5 && (
              <HelpText>oof</HelpText>
            )}
          </ResultItem>

          {results.deathsBeforeFirstSplit > 0 && (
            <ResultItem>
              {results.deathsBeforeFirstSplitPercentage}% of your runs died before the first split.
              {results.deathsBeforeFirstSplitPercentage >= 66 && (
                <HelpText>what is lategame</HelpText> 
              )}
              {results.deathsBeforeFirstSplitPercentage >= 33 && results.deathsBeforeFirstSplitPercentage < 66 && (
                <HelpText>reset early, reset often</HelpText>
              )}
              {results.deathsBeforeFirstSplitPercentage >= 5 && results.deathsBeforeFirstSplitPercentage < 33 && (
                <HelpText>better to not get attached to the run anyways</HelpText>
              )}
              {results.completedRunPercentage < 5 && (
                <HelpText>starting off strong</HelpText>
              )}
            </ResultItem>
          )}

          {results.splitWithMostDeathsPercentage > 0 && (
            <ResultItem>
              {results.splitWithMostDeaths[1] < results.deathsBeforeFirstSplit ? `${results.firstSplitName}` : results.splitWithMostDeaths[0]}
              &nbsp;is the split that hates you the most, killing {results.splitWithMostDeathsPercentage}% of your runs
              <DeadRunGrid>
                <div>{results.firstSplitName}</div>
                <div>{results.deathsBeforeFirstSplitPercentage}%</div>
                {Object.entries(results.splitNamesToDeathCounts).filter(([name]) => name !== '<<undefined>>').map(([name, count]) => (
                  <React.Fragment key={name}>
                    <div>{name}</div>
                    <div>{Math.floor(count as number / results.attemptCount * 100)}%</div>
                  </React.Fragment>
                ))}
              </DeadRunGrid>
            </ResultItem>
          )}
       </Results>
     )}
   </Container>
  );
}

const Container = styled.div`
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
`;

const Header = styled.h1`
  font-size: 6rem;
  margin: 1rem 0 0 0; 
`;

const Subheader = styled.h2`
  font-size: 2rem;
  text-align: center;
  font-weight: 400;
  margin: 0 0 0.5rem 0;
`;

const DragInstructions = styled.div`
  display: flex;
  min-height: 0;
  justify-content: center;
  align-items: center;
  font-size: 2.5rem;
  flex-grow: 1;
  align-self: stretch;
`;

const UploadError = styled.div`
  font-size: 1.5rem;
  margin-top: 1rem;
  color: #c05454;
`;

const ResultItem = styled.div`
  display: flex;
  align-items: center;
  flex-direction: column;
  font-size: 2rem;
  margin-bottom: 2rem;
`;

const HelpText = styled.div`
  font-size: 1.5rem;
  margin-top: 0rem;
  margin-bottom: 2rem;
  text-align: center;
  color: #0a0a0a;
`;

const Results = styled.div`
  display: flex;
  max-width: 1200px;
  align-items: center;
  flex-direction: column;
  margin: 0 auto;
  padding: 2rem 0;
`;

const DeadRunGrid = styled.div`
  display: grid; 
  grid-template-columns: max-content 1fr;
  margin: 1rem 0;
  
  & > div {
    padding: 0.25rem 0.5rem;
    font-size: 1rem;
  }
`;