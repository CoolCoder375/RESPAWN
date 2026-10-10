import { Placeholder } from '@/components/Placeholder';
import { Screen } from '@/components/Screen';

export default function Thought() {
  return (
    <Screen edges={[]}>
      <Placeholder title="Thought of the day" milestone={4} />
    </Screen>
  );
}
