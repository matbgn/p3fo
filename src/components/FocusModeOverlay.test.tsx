import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useEffect } from 'react';
import { FocusModeProvider } from './FocusModeProvider';
import { FocusModeOverlay } from './FocusModeOverlay';
import { useFocusMode } from '@/hooks/useFocusMode';

let mountCount = 0;
let unmountCount = 0;

const Child = () => {
  useEffect(() => {
    mountCount += 1;
    return () => {
      unmountCount += 1;
    };
  }, []);
  return <div>child-content</div>;
};

const Toggle = () => {
  const { isFocusMode, toggleFocusMode } = useFocusMode();
  return (
    <>
      <button onClick={toggleFocusMode}>toggle</button>
      <span>{isFocusMode ? 'focused' : 'normal'}</span>
    </>
  );
};

describe('FocusModeOverlay', () => {
  beforeEach(() => {
    mountCount = 0;
    unmountCount = 0;
  });

  it('keeps the view subtree mounted when toggling focus mode', () => {
    render(
      <FocusModeProvider viewId="test-overlay">
        <FocusModeOverlay>
          <Toggle />
          <Child />
        </FocusModeOverlay>
      </FocusModeProvider>,
    );

    expect(screen.getByText('normal')).toBeInTheDocument();
    expect(mountCount).toBe(1);

    fireEvent.click(screen.getByText('toggle'));

    expect(screen.getByText('focused')).toBeInTheDocument();
    expect(screen.getByText('child-content')).toBeInTheDocument();
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);

    fireEvent.click(screen.getByText('toggle'));

    expect(screen.getByText('normal')).toBeInTheDocument();
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);
  });
});
