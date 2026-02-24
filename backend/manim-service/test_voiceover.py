import os
import subprocess
import tempfile

test_code = """from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService

class TestScene(VoiceoverScene):
    def construct(self):
        self.set_speech_service(GTTSService())
        
        circle = Circle()
        square = Square()
        
        with self.voiceover(text="Welcome to Mwalimu Smart. This is a test of manim voiceover.") as tracker:
            self.play(Create(circle))
            
        with self.voiceover(text="Now we will transform the circle into a square.") as tracker:
            self.play(ReplacementTransform(circle, square))
            
        self.wait(1)
"""

if __name__ == "__main__":
    # Render the scene
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(test_code)
        temp_script = f.name

    print("Rendering test scene...")
    result = subprocess.run([
        'manim',
        '-ql',
        '--format=mp4',
        temp_script,
        'TestScene'
    ], capture_output=True, text=True)
    
    if result.returncode == 0:
        print("Success! Animation rendered.")
    else:
        print("Failed!")
        print(result.stderr)
    
    os.unlink(temp_script)
