import * as React from 'react';
import { cn } from '../lib/utils';

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        type="range"
        className={cn(
          'h-2 w-full cursor-pointer appearance-none rounded-lg bg-secondary accent-primary',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Slider.displayName = 'Slider';

export { Slider };

