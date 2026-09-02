// Smoke test only: proves RNTL + react-test-renderer can render a React
// Native tree headlessly, and that RNTL's built-in matchers are registered
// without a setup file (RNTL >= 12.4). The fixture is intentionally not
// App.tsx — see plan §3.3. No snapshots.
import React from 'react';
import { Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';

function Hello(props: { name: string }): React.JSX.Element {
  const { name } = props;
  return (
    <View>
      <Text testID="greeting">Hello, {name}</Text>
    </View>
  );
}

describe('RNTL renders a React Native tree headlessly', () => {
  it('finds greeting text and confirms it is on screen', () => {
    render(<Hello name="World" />);

    expect(screen.getByTestId('greeting')).toBeOnTheScreen();
    expect(screen.getByText('Hello, World')).toBeOnTheScreen();
  });
});
