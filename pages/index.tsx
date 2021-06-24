import React, { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useDropzone } from 'react-dropzone';
import { formatDuration, intervalToDuration } from 'date-fns';
import { Tooltip } from 'react-tippy';
import { calculatePercentiles, LivesplitData, parseLivesplitDocument } from '../utils/parse-livesplit';

interface Percentage {
  value: number;
  label: string;
}


function formatMillisecondDuration(totalMilliseconds: number): string {
  if (Number.isNaN(totalMilliseconds) || !Number.isFinite(totalMilliseconds)) return '<invalid duration>';

  
  return formatDuration(intervalToDuration({ start: 0, end: totalMilliseconds}), { delimiter: ', ' }).replace(/,([^,]*)$/, ' and $1')
}

function formatPercentage(successes: number, trials: number): Percentage {
  const value = Math.floor(successes / trials * 100);

  return {
    value, 
    label: `${value < 1 ? '<1' : value}%`,
  };
}

const Results: React.FC<{ results: LivesplitData }> = ({ results }) =>  {
  const completedRunCount = Object.values(results.runs).filter(run => run.isComplete).length;
  const completedRunPercentage = formatPercentage(completedRunCount, results.runCount);

  const deathCountBeforeFirstSplit = Object.values(results.runs).filter(run => run.deathSegment?.index === 0 ?? false).length;
  const deathCountBeforeFirstSplitPercentage = formatPercentage(deathCountBeforeFirstSplit, results.runCount);

  const segmentWithMostDeaths = Object.values(results.segments).reduce((max, segment) => segment.totalDeaths > (max?.totalDeaths ?? 0) ? segment : max, null);
  const segmentWithMostDeathsPercentage = formatPercentage(segmentWithMostDeaths?.totalDeaths ?? 0, results.runCount);

  const percentiles = calculatePercentiles(results);

  const sortedSegments = useMemo(() => Object.values(results.segments).sort((a, b) => a.index - b.index), [results.segments]);

  return (
    <ResultsContainer>
      <ResultItem>
        you&apos;ve been running this game for {formatMillisecondDuration(results.totalDuration)}
        <HelpText>
          and that&apos;s just with livesplit running...
        </HelpText>
      </ResultItem>

      <ResultItem>
        your average run lasted {formatMillisecondDuration(Math.floor(results.totalDuration / results.runCount))}
        <HelpText>
          the longest was {formatMillisecondDuration(results.longestAttemptDuration)}. did you leave the timer running?
        </HelpText>
      </ResultItem>

      <ResultItem>
        {completedRunPercentage.label} of your runs finished ({completedRunCount} of {results.runCount})
        {completedRunPercentage.value >= 75 && (
          <HelpText>must be nice</HelpText>
        )}
        {completedRunPercentage.value >= 25 && completedRunPercentage.value < 75 && (
          <HelpText>could be worse</HelpText>
        )}
        {completedRunPercentage.value >= 5 && completedRunPercentage.value < 25 && (
          <HelpText>every day you wake up and choose resets </HelpText>
        )}
        {completedRunPercentage.value < 5 && (
          <HelpText>oof</HelpText>
        )}
      </ResultItem>

      {deathCountBeforeFirstSplit > 0 && (
        <ResultItem>
          {deathCountBeforeFirstSplitPercentage.label} of your runs died before the first split.
          {deathCountBeforeFirstSplitPercentage.value >= 66 && (
            <HelpText>what is lategame</HelpText> 
          )}
          {deathCountBeforeFirstSplitPercentage.value >= 33 && deathCountBeforeFirstSplitPercentage.value < 66 && (
            <HelpText>reset early, reset often</HelpText>
          )}
          {deathCountBeforeFirstSplitPercentage.value >= 5 && deathCountBeforeFirstSplitPercentage.value < 33 && (
            <HelpText>better to not get attached to the run anyways</HelpText>
          )}
          {deathCountBeforeFirstSplitPercentage.value < 5 && (
            <HelpText>starting off strong</HelpText>
          )}
        </ResultItem>
      )}

      {segmentWithMostDeaths && (
        <ResultItem>
          {segmentWithMostDeaths.name} is the split that hates you the most, killing {segmentWithMostDeathsPercentage.label} of your runs
          <DeadRunGrid>
            <DeadRunHeader>
              <div>Segment</div>
              <Tooltip title="The % of all runs that die on this split." position="bottom" arrow distance={8} duration={0}>
                <NumericHeader>Deaths</NumericHeader>
              </Tooltip>
              <Tooltip title="The % of the runs that make it to this split that die on this split." position="bottom" arrow distance={8} duration={0}>
                <NumericHeader>Relative Deaths</NumericHeader>
              </Tooltip>
            </DeadRunHeader>
            {sortedSegments.map(segment => (
              <React.Fragment key={segment.id}>
                <div>{segment.name}</div>
                <DeathCount>{(segment.totalDeaths / results.runCount * 100).toFixed(2)}%</DeathCount>
                <DeathCount>{(segment.totalDeaths / segment.runsReachingSegmentCount * 100).toFixed(2)}%</DeathCount>
              </React.Fragment>
            ))}
          </DeadRunGrid>
        </ResultItem>
      )}

      {Object.entries(percentiles).map(([percentile, segment], index, list) => segment.id === list[index - 1]?.[1].id ? null : (
        <ResultItem>
          {Number(percentile) * 100}% of your runs die before {segment.name}
        </ResultItem>
      ))}
  </ResultsContainer>
  )
}

export default function Home() {
  const [results, setResults] = useState<LivesplitData>(null);
  const [error, setError] = useState(null);
  
  const onDrop = useCallback(acceptedFiles => {
    if (acceptedFiles.length) {
      const [file] = acceptedFiles;
      const reader = new FileReader();

      reader.addEventListener('load', event => {
        try {
          const parser = new DOMParser();
        
          const document = parser.parseFromString(event.target.result as string, 'application/xml');
          const livesplitData = parseLivesplitDocument(document);

          setResults(livesplitData);
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

    {results && <Results results={results} />}
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

const ResultsContainer = styled.div`
  display: flex;
  max-width: 1200px;
  align-items: center;
  flex-direction: column;
  margin: 0 auto;
  padding: 2rem 0;
`;

const DeadRunGrid = styled.div`
  display: grid; 
  grid-template-columns: 1fr repeat(2, max-content);
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

const DeadRunHeader = styled.div`
  display: contents;

  & > div {
    font-weight: 700;
    padding: 0.25rem 0.5rem;
  }
`;

const NumericHeader = styled.div`
  text-align: right;
`;