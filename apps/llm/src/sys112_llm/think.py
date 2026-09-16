from __future__ import annotations


class ThinkFilter:
    def __init__(self) -> None:
        self.buf = ""
        self.hiding = False

    def feed(self, piece: str) -> str:
        self.buf += piece
        visible = ""
        while self.buf:
            if self.hiding:
                end = self.buf.lower().find("</think>")
                if end < 0:
                    self.buf = self.buf[-8:]
                    return visible
                self.buf = self.buf[end + len("</think>") :]
                self.hiding = False
                continue
            start = self.buf.lower().find("<think>")
            if start < 0:
                visible += self.buf
                self.buf = ""
                return visible
            visible += self.buf[:start]
            self.buf = self.buf[start + len("<think>") :]
            self.hiding = True
        return visible
