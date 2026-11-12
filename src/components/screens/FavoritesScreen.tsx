import React from 'react';
import { Heart } from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { CarCard } from '../cards/CarCard';
import { LinkButton } from '../ui/Button';
import { Container, EmptyState, PageTitle } from '../ui/Layout';

export const FavoritesScreen: React.FC = () => {
  const { cars, favorites } = useAppState();
  const saved = favorites.map((id) => cars.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <Container>
      <PageTitle title="Saved cars" subtitle={`${saved.length} ${saved.length === 1 ? 'car' : 'cars'} on your shortlist`} />
      {saved.length === 0 ? (
        <EmptyState
          icon={<Heart className="size-7" />}
          title="Nothing saved yet"
          description="Tap the heart on any car to keep it here for later."
          action={<LinkButton to="/explore" variant="dark">Explore the fleet</LinkButton>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {saved.map((car) => (
            <CarCard key={car.id} car={car} />
          ))}
        </div>
      )}
    </Container>
  );
};
