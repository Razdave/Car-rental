import React from 'react';
import { MapPinOff } from 'lucide-react';
import { LinkButton } from '../ui/Button';
import { Container, EmptyState } from '../ui/Layout';

export const NotFoundScreen: React.FC = () => (
  <Container className="max-w-xl py-12">
    <EmptyState
      icon={<MapPinOff className="size-7" />}
      title="Page not found"
      description="The page you’re looking for doesn’t exist or has moved."
      action={<LinkButton to="/" variant="dark">Back to home</LinkButton>}
    />
  </Container>
);
