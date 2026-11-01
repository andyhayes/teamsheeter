import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { supabase } from './lib/supabase';
import LocalApp from './LocalApp';
import { Loading } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { InvitePage } from './pages/InvitePage';
import { HomePage } from './pages/HomePage';
import { CreateClubPage } from './pages/CreateClubPage';
import { ClubPage } from './pages/ClubPage';
import { TeamLayout } from './pages/TeamLayout';
import { DashboardPage } from './pages/DashboardPage';
import { FixturesPage } from './pages/FixturesPage';
import { SquadPage } from './pages/SquadPage';
import { MatchPage } from './pages/MatchPage';
import { SeasonPage } from './pages/SeasonPage';
import { PlayerPage } from './pages/PlayerPage';
import { DefencePage } from './pages/DefencePage';
import { RecordsPage } from './pages/RecordsPage';
import { TeamSettingsPage } from './pages/TeamSettingsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

export default function App() {
  // Without a Supabase project configured, fall back to the original local-only app.
  if (!supabase) return <LocalApp />;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/local" element={<LocalApp />} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/clubs/new" element={<CreateClubPage />} />
              <Route path="/:club" element={<ClubPage />} />
              <Route path="/:club/:team" element={<TeamLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="fixtures" element={<FixturesPage />} />
                <Route path="squad" element={<SquadPage />} />
                <Route path="matches/:matchId" element={<MatchPage />} />
                <Route path="matches/:matchId/:tab" element={<MatchPage />} />
                <Route path="season" element={<SeasonPage />} />
                <Route path="players/:playerId" element={<PlayerPage />} />
                <Route path="defence" element={<DefencePage />} />
                <Route path="records" element={<RecordsPage />} />
                <Route path="settings" element={<TeamSettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
