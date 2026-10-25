import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom');
  return <p>All good</p>;
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>Dashboard content</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });

  it('renders a fallback UI instead of crashing when a child throws during render', () => {
    // React logs the error to the console by default even when caught by a
    // boundary; silence that expected noise for this test.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText('All good')).not.toBeInTheDocument();
  });

  it('includes the boundaryName in the fallback message to aid debugging', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary boundaryName="Store Owner Dashboard">
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/store owner dashboard hit an unexpected error/i)).toBeInTheDocument();
  });

  it('does not use a placeholder name when boundaryName is omitted', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/this page hit an unexpected error/i)).toBeInTheDocument();
  });

  it('resets and re-renders children after "Try again" is clicked', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Rerender with a controllable prop so we can flip the child back to
    // non-throwing after the reset, simulating a transient error clearing.
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
