import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "infra/competition/compose.yaml"


@unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI is required; no daemon is used")
class CompetitionInfraTest(unittest.TestCase):
    def config(self, with_secrets=True):
        env = {k: v for k, v in os.environ.items() if not k.startswith("COMPETITION_")}
        if with_secrets:
            env.update(COMPETITION_MYSQL_ROOT_PASSWORD="test-only-root",
                       COMPETITION_MYSQL_PASSWORD="test-only-app",
                       COMPETITION_RABBITMQ_PASSWORD="test-only-mq")
        return subprocess.run(
            ["docker", "compose", "--env-file", os.devnull, "-f", str(COMPOSE),
             "config", "--format", "json"],
            env=env, text=True, capture_output=True,
        )

    def test_isolated_names_ports_volumes_and_no_application_start(self):
        result = self.config()
        self.assertEqual(result.returncode, 0, result.stderr)
        config = json.loads(result.stdout)
        self.assertEqual(config["name"], "ai-board-competition-dev")
        self.assertEqual(set(config["services"]), {"mysql", "redis", "rabbitmq"})
        expected_ports = {"mysql": {"13307"}, "redis": {"16379"},
                          "rabbitmq": {"15673", "25673"}}
        for name, service in config["services"].items():
            self.assertNotIn("container_name", service)
            self.assertNotIn("env_file", service)
            self.assertEqual({p["published"] for p in service["ports"]}, expected_ports[name])
            self.assertTrue(all(p["host_ip"] == "127.0.0.1" for p in service["ports"]))
            self.assertTrue(all(v["type"] == "volume" for v in service["volumes"]))
        for resource in [*config["volumes"].values(), *config["networks"].values()]:
            self.assertTrue(resource["name"].startswith("ai-board-competition-dev_"))
            self.assertFalse(resource.get("external", False))
        self.assertEqual(config["services"]["mysql"]["environment"]["MYSQL_DATABASE"],
                         "ai_board_competition")
        self.assertEqual(config["services"]["rabbitmq"]["environment"]["RABBITMQ_DEFAULT_VHOST"],
                         "competition")

    def test_missing_credentials_refuse_configuration(self):
        result = self.config(with_secrets=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("COMPETITION_", result.stderr)


if __name__ == "__main__":
    unittest.main()
