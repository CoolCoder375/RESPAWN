import { Placeholder } from '@/components/Placeholder';
import { Screen } from '@/components/Screen';

export default function Duo() {
  return (
    <Screen edges={[]}>
      <Placeholder title="Your partner" milestone={5} />
    </Screen>
  );
}
