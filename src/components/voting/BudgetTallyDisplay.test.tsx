import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BudgetTallyDisplay } from './BudgetTallyDisplay';

const labels = {
  backers: 'backers',
  shareOfBudget: 'of the group budget',
};

describe('BudgetTallyDisplay', () => {
  it('shows the amount, backers and share of the group budget', () => {
    render(
      <BudgetTallyDisplay
        tally={{ total: 25, backers: 2 }}
        totalBudget={100}
        labels={labels}
      />,
    );

    expect(screen.getByText('$25')).toBeInTheDocument();
    expect(screen.getByText('2 backers')).toBeInTheDocument();
    expect(screen.getByText('25% of the group budget')).toBeInTheDocument();
  });

  it('omits the share bar without an aggregate budget', () => {
    const { container } = render(
      <BudgetTallyDisplay
        tally={{ total: 10, backers: 1 }}
        labels={labels}
      />,
    );

    expect(screen.getByText('$10')).toBeInTheDocument();
    expect(screen.queryByText(/of the group budget/)).not.toBeInTheDocument();
    expect(container.querySelector('.bg-emerald-500')).toBeNull();
  });

  it('renders nothing for an unfunded proposal', () => {
    const { container } = render(
      <BudgetTallyDisplay
        tally={{ total: 0, backers: 0 }}
        totalBudget={100}
        labels={labels}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
