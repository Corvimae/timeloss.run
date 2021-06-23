import { parse, differenceInMilliseconds, startOfDay } from 'date-fns';
import { v4 as uuid } from 'uuid';

const PERCENTILES = [0.5, 0.75, 0.9, 0.95];

interface Segment {
  id: string;
  name: string;
  index: number;
  nextSegmentId: string | null;
  isLastSegment: boolean;
  totalDeaths: number;
  element: Element;
}

interface Run {
  id: string;
  segmentTimes: Record<string, number | null>;
  totalDuration: number;
  lastRecordedSegment: Segment | null,
  deathSegment: Segment | null,
  isComplete: boolean;
}

export function parseTimestamp(rawTimestamp: string): number {
  let dayDuration = 0;
  let timestamp = rawTimestamp.trim();
  const dayCountMatch = timestamp.match(/^([0-9]+)\./);

  if (dayCountMatch) {
    dayDuration += 1000 * 60 * 60 * 24 * Number(dayCountMatch[1]);
    
    const [_, ...rest] = timestamp.split('.');
    
    timestamp = rest.join('.');
  }

  const millisecondMatch = timestamp.match(/\.[0-9]+$/);

  if (!millisecondMatch) {
    timestamp += '.0000000';
  }

  const parsedTime = parse(timestamp, 'HH:mm:ss.SSSSSSS', new Date());

  return dayDuration + differenceInMilliseconds(parsedTime, startOfDay(parsedTime));
}


function assignIDsToSegments(document: Document): Record<string, Segment> {
  return [...document.querySelectorAll('Segment')].reduce<Record<number, Segment>>((acc, segment, index, list) => {
    const segmentId = uuid();
    const previousSegmentId = list[index - 1]?.getAttribute('uuid');

    segment.setAttribute('uuid', segmentId);

    let updatedAcc = {
      ...acc,
      [segmentId]: {
        id: segmentId,
        name: segment.querySelector('Name')?.textContent ?? '<Unnamed>',
        index,
        nextSegmentId: null,
        totalDeaths: 0,
        isLastSegment: index === list.length - 1,
        element: segment,
      },
    };

    if (previousSegmentId) {
      updatedAcc = {
        ...updatedAcc,
        [previousSegmentId]: {
          ...updatedAcc[previousSegmentId],
          nextSegmentId: segmentId,
        },
      };
    }

    return updatedAcc;
  }, {});
}

function calculateAttemptDuration(attempt: Element): number {
  if (!attempt.getAttribute('ended')) return 0;
  const baseDate = new Date();

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

  return duration;
}

export interface LivesplitData {
  segments: Record<string, Segment>;
  runs: Record<number, Run>;
  runCount: number;
  totalDuration: number;
  longestAttemptDuration: number;
  personalBest: Run | null,
}
 
export function parseLivesplitDocument(document: Document): LivesplitData {
  const segmentsById = assignIDsToSegments(document);

  const runDataFromAttempts = [...document.querySelectorAll('AttemptHistory Attempt')].reduce<Record<string, Run>>((acc, attempt) => {
    const attemptId = attempt.getAttribute('id');

    return {
      ...acc,
      [attemptId]: {
        id: attemptId,
        segmentTimes: {},
        totalDuration: calculateAttemptDuration(attempt),
        lastRecordedSegment: null,
        deathSegment: null,
        isComplete: false,
      }
    };
  }, {});

  const runs = [...document.querySelectorAll('Segment')].reduce((acc, segment) => {
    const segmentId = segment.getAttribute('uuid');

    return [...segment.querySelectorAll('SegmentHistory Time')].reduce((innerAcc, runElement) => {
      const runId = runElement.getAttribute('id');
      const timeElement = runElement.querySelector('GameTime') || runElement.querySelector('RealTime');

      if (!innerAcc[runId]) return innerAcc;

      return {
        ...innerAcc,
        [runId]: {
          ...innerAcc[runId],
          segmentTimes: {
            ...innerAcc[runId].segmentTimes,
            [segmentId]: timeElement ? parseTimestamp(timeElement.textContent) : null,
          },
        },
      };
    }, acc);
  }, runDataFromAttempts);

  const firstSegment = Object.values(segmentsById).find(segment => segment.index === 0);

  const runsWithMetadata = (Object.entries(runs) as [string, Run][]).reduce<Record<string, Run>>((acc, [id, run]) => {
    const lastRecordedSegmentIndex = Object.keys(run.segmentTimes).reduce((segmentIndex, id) => Math.max(segmentsById[id].index, segmentIndex), -1)
    const lastRecordedSegment = Object.values(segmentsById).find(segment => segment.index === lastRecordedSegmentIndex);
    const hasNoRecordedSegments = Object.values(run.segmentTimes).length === 0;

    return {
      ...acc,
      [id]: {
        ...run,
        lastRecordedSegment,
        isComplete: lastRecordedSegment?.isLastSegment ?? false,
        deathSegment: hasNoRecordedSegments ? firstSegment : (lastRecordedSegment?.nextSegmentId && segmentsById[lastRecordedSegment.nextSegmentId]),
      },
    };
  }, {});

  const segmentsWithMetadata = (Object.entries(segmentsById) as [string, Segment][]).reduce<Record<string, Segment>>((acc, [id, segment]) => {
    return {
      ...acc,
      [id]: {
        ...segment,
        totalDeaths: Object.values(runsWithMetadata).filter(run => run.deathSegment?.id === id).length,
      },
    };
  }, {});
  
  const runList = Object.values(runsWithMetadata);
  
  return {
    segments: segmentsWithMetadata,
    runs: runsWithMetadata,
    runCount: runList.length,
    totalDuration: runList.reduce((acc, { totalDuration }) => acc + totalDuration, 0),
    longestAttemptDuration: Math.max(...runList.map(({ totalDuration }) => totalDuration)),
    personalBest: runList.reduce((best, run) => {
      if (!best) return run;

      return run.totalDuration < best.totalDuration ? run : best;
    }, null),
  };
}

export function calculatePercentiles(livesplitData: LivesplitData): Record<number, Segment> {
  return PERCENTILES.reduce((acc, percentile) => {
    let sum = 0;

    for (let segment of Object.values(livesplitData.segments)) {
      sum += segment.totalDeaths as number ?? 0;

      if (sum / livesplitData.runCount > percentile) {
        return {
          ...acc,
          [percentile]: segment
        }
      }
    }

    return acc;
  }, {});
}
