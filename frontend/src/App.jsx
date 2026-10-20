import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useStore } from "./lib/store.js";
import Layout from "./components/layout/Layout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import BrowsePage from "./pages/BrowsePage.jsx";
import LessonPlayerPage from "./pages/LessonPlayerPage.jsx";
import AssessmentPage from "./pages/AssessmentPage.jsx";
import AuthoringDashboard from "./pages/authoring/AuthoringDashboard.jsx";
import ReviewQueue from "./pages/authoring/ReviewQueue.jsx";
import VoicePage from "./pages/VoicePage.jsx";
import MyLearningPage from "./pages/MyLearningPage.jsx";
import AskPage from "./pages/AskPage.jsx";

function Protected({ children }) {
  const token = useStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

function TeacherOnly({ children }) {
  const user = useStore((s) => s.user);
  const isStaff = user?.role === "teacher" || user?.role === "admin";
  return isStaff ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="dashboard" element={<Navigate to="/" replace />} />
        <Route path="browse" element={<BrowsePage />} />
        <Route path="browse/:grade/:subject" element={<BrowsePage />} />
        <Route path="lesson/:lesson_id" element={<LessonPlayerPage />} />
        <Route path="lesson/:lesson_id/assess" element={<AssessmentPage />} />
        <Route path="lesson/:lesson_id/diagnostic" element={<AssessmentPage />} />
        <Route path="me" element={<MyLearningPage />} />
        <Route path="ask" element={<AskPage />} />
        <Route path="history" element={<Navigate to="/me" replace />} />
        <Route path="voice" element={<VoicePage />} />
        <Route
          path="authoring"
          element={
            <TeacherOnly>
              <AuthoringDashboard />
            </TeacherOnly>
          }
        />
        <Route
          path="authoring/review"
          element={
            <TeacherOnly>
              <ReviewQueue />
            </TeacherOnly>
          }
        />
        <Route
          path="authoring/review/:lesson_id"
          element={
            <TeacherOnly>
              <ReviewQueue />
            </TeacherOnly>
          }
        />
        <Route path="lesson/new" element={<Navigate to="/authoring" replace />} />
      </Route>
    </Routes>
  );
}
