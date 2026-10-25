import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState, ErrorState, PageLoader } from '../UIStates';
import { FiHeart } from 'react-icons/fi';

describe('EmptyState', () => {
  it('renders the title and optional description', () => {
    render(<EmptyState icon={FiHeart} title="Your wishlist is empty" description="Tap the heart to save one." />);
    expect(screen.getByText('Your wishlist is empty')).toBeInTheDocument();
    expect(screen.getByText('Tap the heart to save one.')).toBeInTheDocument();
  });

  it('renders an action when one is provided', () => {
    render(<EmptyState title="Nothing here" action={<button>Browse</button>} />);
    expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('is announced to assistive tech via role="alert"', () => {
    render(<ErrorState message="Could not load orders." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load orders.');
  });

  it('calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('omits the retry button when no onRetry handler is given', () => {
    render(<ErrorState />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('PageLoader', () => {
  it('announces its loading label politely for screen readers', () => {
    render(<PageLoader label="Loading your orders..." />);
    expect(screen.getByText('Loading your orders...')).toHaveAttribute('aria-live', 'polite');
  });
});
