"""Catalog fallback and validation; no translation fixtures enter shipped builds."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import build_shell


class CopyBuildTests(unittest.TestCase):
    def test_fallback_validation_and_escaping(self):
        english = build_shell.load_catalog()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'locales').mkdir()
            (root / 'locales/en.json').write_text(json.dumps(english))
            translated = root / 'locales/fr.json'
            translated.write_text(json.dumps({'theme.welcome.title': '<Bonjour & "amis">'}))
            with patch.object(build_shell, 'ROOT', root):
                messages = build_shell.load_catalog('fr')
                self.assertEqual(messages['theme.welcome.help'], english['theme.welcome.help'])
                translated.write_text(json.dumps({'rotation.clock': {'other': '{time} missing count'}}))
                with self.assertRaisesRegex(ValueError, 'placeholders'):
                    build_shell.load_catalog('fr')
                translated.write_text(json.dumps({'unknown.key': 'typo'}))
                with self.assertRaisesRegex(ValueError, 'Unknown copy key'):
                    build_shell.load_catalog('fr')
                with self.assertRaises(ValueError):
                    build_shell.load_catalog('../outside')
        with patch.object(build_shell, 'load_catalog', return_value=messages):
            rendered = build_shell.build_shell('fr')
        self.assertIn('<html lang="fr">', rendered)
        self.assertIn('&lt;Bonjour &amp; &quot;amis&quot;&gt;</h2>', rendered)
        self.assertNotIn('{{copy:', rendered)
        self.assertNotIn('{{COPY_CATALOG}}', rendered)


if __name__ == '__main__':
    unittest.main()
