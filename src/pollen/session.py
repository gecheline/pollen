sessions: dict = {}


def get_session(session_id: str) -> dict:
    if session_id not in sessions:
        sessions[session_id] = {
            "baseline_turns": [],
            "lens_turns": {},
            "mixed_turns": [],
        }
    return sessions[session_id]


def assemble_conversation(session, panel_type, lens_id, user_message, history_mode):
    """Build conversation list for a panel given the history mode."""
    msgs = []

    if panel_type == "baseline":
        for turn in session["baseline_turns"]:
            msgs.append({"role": "user", "content": turn["user"]})
            msgs.append({"role": "assistant", "content": turn["assistant"]})

    elif panel_type == "mixed":
        for turn in session["mixed_turns"]:
            msgs.append({"role": "user", "content": turn["user"]})
            msgs.append({"role": "assistant", "content": turn["assistant"]})

    elif panel_type == "lens":
        if history_mode == "only_mixed":
            for turn in session["mixed_turns"]:
                msgs.append({"role": "user", "content": turn["user"]})
                msgs.append({"role": "assistant", "content": turn["assistant"]})

        elif history_mode == "only_own":
            for turn in session["lens_turns"].get(lens_id, []):
                msgs.append({"role": "user", "content": turn["user"]})
                msgs.append({"role": "assistant", "content": turn["assistant"]})

        elif history_mode == "mixed_own":
            own_turns = session["lens_turns"].get(lens_id, [])
            mixed_turns = session["mixed_turns"]
            n_turns = max(len(own_turns), len(mixed_turns))
            for i in range(n_turns):
                if i < len(mixed_turns):
                    msgs.append({"role": "user", "content": mixed_turns[i]["user"]})
                elif i < len(own_turns):
                    msgs.append({"role": "user", "content": own_turns[i]["user"]})
                if i < len(own_turns):
                    msgs.append({"role": "assistant", "content": own_turns[i]["assistant"]})
                if i < len(mixed_turns):
                    msgs.append({"role": "assistant", "content": mixed_turns[i]["assistant"]})

    msgs.append({"role": "user", "content": user_message})
    return msgs[-20:]
