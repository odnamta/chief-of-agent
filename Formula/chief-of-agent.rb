class ChiefOfAgent < Formula
  desc "Agent governance platform for Claude Code — monitor, control, audit AI agents"
  homepage "https://github.com/odnamta/chief-of-agent"
  url "https://github.com/odnamta/chief-of-agent.git", tag: "v1.0.0"
  license "MIT"

  depends_on "node@20"

  def install
    system "npm", "install", "--production"
    system "npm", "run", "build"
    libexec.install Dir["*"]
    bin.install_symlink libexec/"dist/cli.js" => "chief-of-agent"
  end

  def post_install
    ohai "Chief of Agent installed!"
    ohai "Run: chief-of-agent setup --http --auto"
    ohai "Then build the macOS app: cd #{libexec} && bash scripts/install-macos.sh"
  end

  def caveats
    <<~EOS
      To get started:
        chief-of-agent setup --http --auto

      To install the macOS menu bar app:
        cd #{libexec} && bash scripts/install-macos.sh

      To start the web dashboard:
        cd #{libexec}/dashboard && npm install && npm run dev
    EOS
  end

  test do
    assert_match "chief-of-agent", shell_output("#{bin}/chief-of-agent --help")
  end
end
