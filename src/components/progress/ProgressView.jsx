import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { exerciseProgress, exercisesTrainedInHistory, workoutVolume } from '../../utils/workoutStats';
import JimmyEvolution from '../evolution/JimmyEvolution';
import StreakHeatmap from './StreakHeatmap';
import WeeklySummaryCard from './WeeklySummaryCard';
import LifetimeVolumeCard from './LifetimeVolumeCard';
import WeeklyVolumeCard from './WeeklyVolumeCard';
import MuscleGroupGoals from './MuscleGroupGoals';
import RecentWorkoutsList from './RecentWorkoutsList';

const dateFmt = (iso) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

const chartTooltipStyle = {
  background: '#1c1c1e',
  border: 'none',
  borderRadius: 12,
  fontSize: 13,
};

export default function ProgressView({ workouts, exercises, bodyWeightKg = 0, minStage = 1 }) {
  const { getExercise } = exercises;
  const finished = workouts.filter((w) => w.finishedAt).slice().reverse();
  const trainedIds = useMemo(() => exercisesTrainedInHistory(workouts), [workouts]);
  const [selectedExercise, setSelectedExercise] = useState(trainedIds[0] ?? '');

  const volumeSeries = finished.map((w) => ({
    date: dateFmt(w.finishedAt),
    volume: workoutVolume(w),
  }));

  const weightSeries = selectedExercise
    ? exerciseProgress(workouts, selectedExercise).map((p) => ({
        date: dateFmt(p.date),
        weight: p.topWeight,
      }))
    : [];

  return (
    <div className="flex flex-col gap-6 pt-6 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-neutral-50">Progress</h1>
        <Link
          to="/profile"
          aria-label="Profile"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-lg"
        >
          👤
        </Link>
      </header>

      <JimmyEvolution workouts={workouts} bodyWeightKg={bodyWeightKg} minStage={minStage} />
      <StreakHeatmap workouts={workouts} />
      <LifetimeVolumeCard workouts={workouts} bodyWeightKg={bodyWeightKg} minStage={minStage} />
      <WeeklyVolumeCard workouts={workouts} />
      <WeeklySummaryCard workouts={workouts} />
      <MuscleGroupGoals workouts={workouts} />

      {finished.length > 0 && (
        <>
          <section className="card p-5">
            <h2 className="text-lg font-semibold text-neutral-100 mb-3">Volume Over Time</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={volumeSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" vertical={false} />
                <XAxis dataKey="date" stroke="#8e8e93" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#8e8e93" fontSize={12} tickLine={false} axisLine={false} width={36} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={{ color: '#f5f5f7' }}
                  cursor={{ fill: '#ffffff08' }}
                />
                <Bar dataKey="volume" fill="#d45b38" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-neutral-100">Strength Progress</h2>
              <select
                value={selectedExercise}
                onChange={(e) => setSelectedExercise(e.target.value)}
                className="bg-neutral-800 rounded-lg text-sm text-neutral-200 px-2.5 py-1.5 focus:outline-none"
              >
                {trainedIds.map((id) => (
                  <option key={id} value={id}>
                    {getExercise(id)?.name ?? id}
                  </option>
                ))}
              </select>
            </div>
            {weightSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={weightSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" vertical={false} />
                  <XAxis dataKey="date" stroke="#8e8e93" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#8e8e93" fontSize={12} tickLine={false} axisLine={false} width={36} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: '#f5f5f7' }} />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="#d45b38"
                    strokeWidth={2.5}
                    dot={{ fill: '#d45b38', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-neutral-500 text-center py-8">No data yet for this exercise</p>
            )}
          </section>
        </>
      )}

      <RecentWorkoutsList workouts={workouts} />
    </div>
  );
}
