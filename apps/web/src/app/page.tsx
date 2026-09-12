import { HomeOnboarding } from "../components/HomeOnboarding";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <HomeOnboarding
      localPlayMode={process.env.NUVITAE_LOCAL_PLAY_MODE === "true"}
    />
  );
}
