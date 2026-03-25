import os
import hashlib
import google.generativeai as genai
from dotenv import load_dotenv
import subprocess
import tempfile

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

# Gemini AI
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))

VIDEO_DIR = os.path.join(os.path.dirname(__file__), 'videos')
os.makedirs(VIDEO_DIR, exist_ok=True)

from typing import Optional

def generate_manim_code(step_text: str, topic: str, script: Optional[str] = None, error_log: str = "", previous_code: str = "") -> str:
    """Manim Programmer Agent: Generates Manim code, potentially correcting previous errors."""
    
    model_name = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
    if model_name == 'gemini-2.5-flash':
        print(f"\n[SYSTEM WARNING] Model '{model_name}' is requested. If this fails, consider 'gemini-1.5-flash'.\n")
    model = genai.GenerativeModel(model_name) # Using configurable model
    
    if error_log and previous_code:
        prompt = f"""
# CONTEXT
You are a Manim Programmer Agent for MwalimuSmart. Your previous attempt to generate code failed.

# OBJECTIVE
FIX the Manim code for the topic "{topic}" based on the error log provided.

# STYLE (CLEAR Framework)
1. **CONCISE**: Fix ONLY the necessary parts.
2. **LOGICAL**: Ensure a valid 'GeneratedScene' class structure.
3. **EXPLICIT**: Use EXACT narration scripts in 'voiceover' blocks.

# PREVIOUS ATTEMPT
```python
{previous_code}
```

# ERROR LOG
{error_log}

# REQUIREMENTS
- Inherit from 'VoiceoverScene'.
- Use 'GTTSService'.
- Return ONLY the corrected Python code.
"""
    else:
        prompt = f"""
# CONTEXT
You are a Manim Programmer Agent for MwalimuSmart. You create educational animations synchronized with voiceovers.

# OBJECTIVE
Generate Python code using 'manim' and 'manim-voiceover' for:
Topic: {topic}
Step: {step_text}
Narration Script: {script or step_text}

# VISUAL ARRANGEMENT
1. **NO OVERLAP**: Geometric shapes, text, and labels MUST NOT overlap.
2. **GROUPING**: Use 'VGroup' to manage multiple objects.
3. **SPACING**: Use '.arrange(DOWN, buff=0.5)' or '.next_to(other_obj, RIGHT, buff=1.0)'.
4. **LABELS**: Always place labels using '.next_to(object, direction)' logic.
5. **DETAIL**: Build rich scenes. If explaining a circuit, show the battery, wires, resistor, and current flow arrows.

# STYLE (CLEAR Framework)
1. **CONCISE**: Every animation must be educational, but NOT sparse. Create a comprehensive visual representation.
2. **LOGICAL**: Synchronize visuals inside 'with self.voiceover(...) as tracker:' blocks.
3. **EXPLICIT**: Use EXACT Narration Script. High contrast colors only.

# RESPONSE FORMAT
Return ONLY the complete Python code. No explanations.

# EXAMPLE STRUCTURE
```python
from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService

class GeneratedScene(VoiceoverScene):
    def construct(self):
        self.set_speech_service(GTTSService())
        
        # 1. Setup rich environment
        axes = Axes(x_range=[0, 5], y_range=[0, 5], axis_config={{"include_tip": True}})
        labels = axes.get_axis_labels(x_label="Time", y_label="Value")
        
        # 2. Detailed objects
        circle = Circle(radius=1.0, color=BLUE).shift(UP*1)
        dot = Dot(color=YELLOW).move_to(circle.get_start())
        trace = TracedPath(dot.get_center, stroke_color=YELLOW, stroke_width=4)
        
        main_vgroup = VGroup(axes, labels, circle, dot, trace).center()
        
        # 3. Synchronized animation
        with self.voiceover(text="EXACT SCRIPT HERE") as tracker:
            self.play(Create(axes), Write(labels))
            self.play(Create(circle))
            self.add(trace)
            self.play(MoveAlongPath(dot, circle), run_time=tracker.duration)
```
"""
    
    response = model.generate_content(prompt)
    code = response.text
    
    # Clean the code (remove markdown code blocks if present)
    if '```python' in code:
        code = code.split('```python')[1].split('```')[0]
    elif '```' in code:
        code = code.split('```')[1].split('```')[0]
    
    return code.strip()

def generate_animation(step_text: str, step_number: int, topic: str, script: Optional[str] = None) -> str:
    """Generate Manim animation with a self-correction loop."""
    
    # Create cache key
    cache_key = hashlib.md5(f"{topic}:{step_text}:{script}".encode()).hexdigest()
    video_filename = f"animation_{cache_key}.mp4"
    video_path = os.path.join(VIDEO_DIR, video_filename)
    
    # Return cached video if exists
    if os.path.exists(video_path):
        print(f"Using cached animation: {video_filename}")
        return video_path
    
    max_attempts = 3
    error_log: str = ""
    previous_code: str = ""
    
    for attempt in range(max_attempts):
        try:
            print(f"Attempt {attempt + 1}: Generating Manim code...")
            manim_code: str = generate_manim_code(step_text, topic, script, error_log, previous_code)
            previous_code = manim_code
            
            # Create temporary Python file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(manim_code)
                temp_script = f.name
            
            # Render animation with Manim
            print(f"Attempt {attempt + 1}: Rendering animation...")
            output_dir = tempfile.mkdtemp()
            
            result = subprocess.run([
                'manim',
                '-ql',  # Low quality for faster rendering
                '--format=mp4',
                f'--output_file={video_filename}',
                temp_script,
                'GeneratedScene'
            ], capture_output=True, text=True, cwd=output_dir)
            
            # Cleanup script immediately
            os.unlink(temp_script)
            
            if result.returncode != 0:
                print(f"Attempt {attempt + 1} failed. Capturing error for correction...")
                error_log = result.stderr or ""
                continue # Try next attempt with correction
            
            # Find the generated video
            media_dir = os.path.join(output_dir, 'media', 'videos')
            found_video = False
            for root, dirs, files in os.walk(media_dir):
                for file in files:
                    if file.endswith('.mp4'):
                        generated_video = os.path.join(root, file)
                        os.rename(generated_video, video_path)
                        found_video = True
                        break
                if found_video: break
            
            if not os.path.exists(video_path):
                error_log = "Video file not found after rendering process."
                continue
            
            print(f"Animation generated successfully on attempt {attempt + 1}")
            return video_path
            
        except Exception as e:
            print(f"Exception on attempt {attempt + 1}: {e}")
            error_log = str(e)
            
    raise Exception(f"Failed to generate animation after {max_attempts} attempts. Last error: {error_log}")

