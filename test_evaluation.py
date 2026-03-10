import unittest
from evaluation_models import Experiment
from experiment_runner import ExperimentRunner
from evaluation_dashboard import generate_learning_gains_chart

class TestEvaluationFramework(unittest.TestCase):
    def setUp(self):
        self.experiment = Experiment(experiment_id="exp_001", name="Test Teaching Efficacy", description="Testing adaptive learning")
        self.runner = ExperimentRunner(self.experiment)

    def test_random_assignment(self):
        # Assign 100 students
        group_assignments = {'treatment': 0, 'control': 0}
        for i in range(100):
            group = self.runner.assign_student(f"student_{i}")
            group_assignments[group] += 1
            
        self.assertEqual(sum(group_assignments.values()), 100)
        # Random distribution should be somewhat even, but we don't strictly assert exactly 50/50
        self.assertTrue(group_assignments['treatment'] > 30 and group_assignments['control'] > 30)
        
        # Consistent assignment
        group = self.runner.assign_student("student_0")
        self.assertEqual(self.runner.assign_student("student_0"), group)

    def test_learning_gains_analysis(self):
        # Mock some data
        # Treatment group gets higher post scores
        for i in range(10):
            sid = f"t_student_{i}"
            self.runner.assign_student(sid)
            # Force into treatment for this test
            if sid in self.experiment.control_group:
                self.experiment.control_group.remove(sid)
                self.experiment.treatment_group.append(sid)
                
            self.runner.record_learning_result(sid, pre_score=50, post_score=85)
            
        # Control group gets lower post scores
        for i in range(10):
            sid = f"c_student_{i}"
            self.runner.assign_student(sid)
            # Force into control for this test
            if sid in self.experiment.treatment_group:
                self.experiment.treatment_group.remove(sid)
                self.experiment.control_group.append(sid)
                
            self.runner.record_learning_result(sid, pre_score=50, post_score=60)
            
        report = self.runner.run_analysis()
        self.assertEqual(report["treatment_mean_gain"], 35.0)
        self.assertEqual(report["control_mean_gain"], 10.0)
        self.assertTrue(report["statistically_significant"])

if __name__ == '__main__':
    unittest.main()
