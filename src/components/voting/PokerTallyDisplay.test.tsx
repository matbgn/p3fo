import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PokerTallyDisplay } from './PokerTallyDisplay';

const labels = {
  verdict: 'Verdict',
  average: 'Average',
  standardDeviation: 'Std. deviation',
  voters: 'voters',
  voter: 'voter',
  unknown: 'Unsure',
  coffee: 'Coffee break',
  animals: {
    mouse: 'Mouse',
    cat: 'Cat',
    dog: 'Dog',
    sheep: 'Sheep',
    cow: 'Cow',
    elephant: 'Elephant',
  },
};

describe('PokerTallyDisplay', () => {
  it('shows the verdict, numeric stats and card distribution', () => {
    render(
      <PokerTallyDisplay
        tally={{
          scaleId: 'fibonacci',
          numeric: true,
          median: 3,
          average: 3.7,
          standardDeviation: 0.9,
          verdict: '3',
          distribution: { 0: 0, 1: 0, 2: 0, 3: 2, 5: 1, 8: 0, 13: 0, 21: 0, 34: 0, 55: 0, 89: 0, 100: 0, 1000: 0 },
          total: 3,
          estimable: 3,
          unknown: 0,
          coffee: 0,
        }}
        labels={labels}
      />,
    );

    expect(screen.getByText('Verdict')).toBeInTheDocument();
    expect(screen.getByText('3', { selector: '.bg-teal-600' })).toBeInTheDocument();
    expect(screen.getByText('3.7')).toBeInTheDocument();
    expect(screen.getByText('0.9')).toBeInTheDocument();
    expect(screen.getByText('3 voters')).toBeInTheDocument();
    expect(screen.getAllByTitle('3: 2')).toHaveLength(2);
    expect(screen.getAllByTitle('5: 1')).toHaveLength(2);
  });

  it('shows special cards without numeric stats', () => {
    render(
      <PokerTallyDisplay
        tally={{
          scaleId: 'tshirt',
          numeric: false,
          median: 3,
          average: 3,
          standardDeviation: 0,
          verdict: 'M',
          distribution: { 1: 0, 2: 0, 3: 1, 5: 0, 8: 0, 13: 0, 100: 1, 1000: 1 },
          total: 3,
          estimable: 1,
          unknown: 1,
          coffee: 1,
        }}
        labels={labels}
      />,
    );

    expect(screen.queryByText('Average')).not.toBeInTheDocument();
    expect(screen.getByTitle('Unsure: 1')).toBeInTheDocument();
    expect(screen.getByTitle('Coffee break: 1')).toBeInTheDocument();
  });

  it('renders nothing when nobody voted', () => {
    const { container } = render(
      <PokerTallyDisplay
        tally={{
          scaleId: 'fibonacci',
          numeric: true,
          median: null,
          average: null,
          standardDeviation: null,
          verdict: '?',
          distribution: { 0: 0, 1: 0, 2: 0, 3: 0, 5: 0, 8: 0, 13: 0, 21: 0, 34: 0, 55: 0, 89: 0, 100: 0, 1000: 0 },
          total: 0,
          estimable: 0,
          unknown: 0,
          coffee: 0,
        }}
        labels={labels}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
