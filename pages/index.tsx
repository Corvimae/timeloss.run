import React, { useCallback, useState } from 'react';
import styled from 'styled-components';
import { useDropzone } from 'react-dropzone';
import { parse, differenceInMilliseconds, formatDuration, intervalToDuration, startOfDay } from 'date-fns';

const PERCENTILES = [0.5, 0.75, 0.9, 0.95];

interface Percentage {
  value: number;
  label: string;
}

interface ParseResults {
  attemptCount: number;
  completedRunCount: number;
  totalAttemptDuration: number;
  deathsBeforeFirstSplit: number;
  deathsBeforeFirstSplitPercentage: Percentage;
  splitWithMostDeaths: [string, number];
  splitWithMostDeathsPercentage: Percentage;
  splitNamesToDeathCounts: Record<string, number>;
  sortedSplitNamesToDeathCounts: Record<string, number>;
  percentiles: Record<number, string>;
  firstSplitName: string;
  completedRunPercentage: Percentage;
  humanizedTotalDuration: string;
  humanizedAverageDuration: string;
  humanizedLongestDuration: string;
  humanizedPBDuration: string;
}

function formatMillisecondDuration(totalMilliseconds: number): string {
  return formatDuration(intervalToDuration({ start: 0, end: totalMilliseconds}), { delimiter: ', ' }).replace(/,([^,]*)$/, ' and $1')
}

function formatPercentage(successes: number, trials: number): Percentage {
  const value = Math.floor(successes / trials * 100);

  return {
    value, 
    label: `${value < 1 ? '<1' : value}%`,
  };
}

function determineRunDeathPoints(document: Document): Record<number, Element> {
  const lastSplits = [...document.querySelectorAll('Segment')].reduce<Record<number, Element>>((acc, segment) => {
    return [...segment.querySelectorAll('SegmentHistory Time')]
      .map(time => Number(time.getAttribute('id')))
      .reduce((innerAcc, id) => ({ ...innerAcc, [id]: segment }), acc);
  }, {});

  return Object.entries(lastSplits)
    .filter(([_, split]) => split.nextElementSibling !== null)
    .reduce<Record<number, Element>>((acc, [id, split]) => ({
      ...acc,
      [id]: split.nextElementSibling,
    }), {});
}

export default function Home() {
  const [results, setResults] = useState<ParseResults>(null);
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
          const runDurations = attempts.map(attempt => {
            if (!attempt.getAttribute('ended')) return undefined;
            let duration = differenceInMilliseconds(
              parse(attempt.getAttribute('ended'), 'MM/dd/yyyy HH:mm:ss', baseDate),
              parse(attempt.getAttribute('started'), 'MM/dd/yyyy HH:mm:ss', baseDate),
            );

            const pauseTime = attempt.querySelector('PauseTime');

            if (pauseTime) {
              let pauseText = pauseTime.textContent.trim();
              const dayCountMatch = pauseText.match(/^([0-9]+)\./);

              if (dayCountMatch) {
                duration -= 1000 * 60 * 60 * 24 * Number(dayCountMatch[1]);
                
                const [_, ...rest] = pauseText.split('.');
                
                pauseText = rest.join('.');
              }
            
              const pauseTimestamp = parse(pauseText, 'HH:mm:ss.SSSSSSS', baseDate);

              duration -= differenceInMilliseconds(pauseTimestamp, startOfDay(pauseTimestamp));
            }

            return [duration, attempt];
          }).filter(item => item !== undefined) as [number, Element][];

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

          const deathsBeforeFirstSplit = attempts.length - Object.values(splitNamesToDeathCounts).reduce<number>((acc, value) => acc + value, 0) - completedAttemptDurations.length;
          const splitWithMostDeaths = Object.entries(splitNamesToDeathCounts).reduce<[string, number]>(([accName, accCount], [name, count]) => {
            if (name !== '<<undefined>>' && count > accCount) return [name, count];

            return [accName, accCount];
          }, ['', 0]);

          const segmentNames = [...document.querySelectorAll('Segment Name')].map(name => name.textContent.trim());
          const sortedSplitNamesToDeathCounts = segmentNames.reduce((acc, name, index) => ({
            ...acc,
            [name]: index === 0 ? deathsBeforeFirstSplit : splitNamesToDeathCounts[name],
          }), {});

          const percentiles = PERCENTILES.reduce((acc, percentile) => {
            let sum = 0;

            for (let [segment, count] of Object.entries(sortedSplitNamesToDeathCounts)) {
              sum += count as number ?? 0;

              if (sum / attempts.length > percentile) {
                return {
                  ...acc,
                  [percentile]: segment
                }
              }
            }

            return acc;
          }, {});

          setResults({
            attemptCount: attempts.length,
            completedRunCount: completedAttemptDurations.length,
            totalAttemptDuration,
            deathsBeforeFirstSplit,
            deathsBeforeFirstSplitPercentage: formatPercentage(deathsBeforeFirstSplit, attempts.length),
            splitWithMostDeaths,
            splitWithMostDeathsPercentage: formatPercentage(Math.max(deathsBeforeFirstSplit, splitWithMostDeaths[1]), attempts.length),
            splitNamesToDeathCounts,
            sortedSplitNamesToDeathCounts,
            percentiles,
            firstSplitName: document.querySelector('Segment Name').textContent,
            completedRunPercentage:formatPercentage(completedAttemptDurations.length, attempts.length),
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

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

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
            you&apos;ve been running this game for {results.humanizedTotalDuration}
            <HelpText>
              and that&apos;s just with livesplit running...
            </HelpText>
          </ResultItem>

          <ResultItem>
            your average run lasted {results.humanizedAverageDuration}
            <HelpText>
              the longest was {results.humanizedLongestDuration}. did you leave the timer running?
            </HelpText>
          </ResultItem>

          <ResultItem>
            {results.completedRunPercentage.label} of your runs finished ({results.completedRunCount} of {results.attemptCount})
            {results.completedRunPercentage.value >= 75 && (
              <HelpText>must be nice</HelpText>
            )}
            {results.completedRunPercentage.value >= 25 && results.completedRunPercentage.value < 75 && (
              <HelpText>could be worse</HelpText>
            )}
            {results.completedRunPercentage.value >= 5 && results.completedRunPercentage.value < 25 && (
              <HelpText>every day you wake up and choose resets </HelpText>
            )}
            {results.completedRunPercentage.value < 5 && (
              <HelpText>oof</HelpText>
            )}
          </ResultItem>

          {results.deathsBeforeFirstSplit > 0 && (
            <ResultItem>
              {results.deathsBeforeFirstSplitPercentage.label} of your runs died before the first split.
              {results.deathsBeforeFirstSplitPercentage.value >= 66 && (
                <HelpText>what is lategame</HelpText> 
              )}
              {results.deathsBeforeFirstSplitPercentage.value >= 33 && results.deathsBeforeFirstSplitPercentage.value < 66 && (
                <HelpText>reset early, reset often</HelpText>
              )}
              {results.deathsBeforeFirstSplitPercentage.value >= 5 && results.deathsBeforeFirstSplitPercentage.value < 33 && (
                <HelpText>better to not get attached to the run anyways</HelpText>
              )}
              {results.deathsBeforeFirstSplitPercentage.value < 5 && (
                <HelpText>starting off strong</HelpText>
              )}
            </ResultItem>
          )}

          {results.splitWithMostDeathsPercentage.value > 0 && (
            <ResultItem>
              {results.splitWithMostDeaths[1] < results.deathsBeforeFirstSplit ? `${results.firstSplitName}` : results.splitWithMostDeaths[0]}
              &nbsp;is the split that hates you the most, killing {results.splitWithMostDeathsPercentage.label} of your runs
              <DeadRunGrid>
                {Object.entries(results.sortedSplitNamesToDeathCounts).map(([name, count]) => (
                  <React.Fragment key={name}>
                    <div>{name}</div>
                    <DeathCount>{((count || 0) as number / results.attemptCount * 100).toFixed(2)}%</DeathCount>
                  </React.Fragment>
                ))}
              </DeadRunGrid>
            </ResultItem>
          )}
          {Object.entries(results.percentiles).map(([percentile, split], index, list) => split === list[index - 1]?.[1] ? null : (
            <ResultItem>
              {Number(percentile) * 100}% of your runs die before {split}
            </ResultItem>
          ))}
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
  text-align: center;
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

const DeathCount = styled.div`
  font-variant-numeric: tabular-nums;
  text-align: right;
`;