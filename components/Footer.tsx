import { Mark } from "./Logo";

export default function Footer() {
  return (
    <footer className="footer" data-cover>
      <div className="footer-top">
        <div className="footer-brand">
          <Mark size={34} />
          <p>
            The future of waste collection.
            <br />
            Launching in HSR Layout.
          </p>
        </div>
        <div className="footer-cols">
          <div>
            <span className="mono footer-k">EXPLORE</span>
            <a href="#problem">The problem</a>
            <a href="#system">How it works</a>
            <a href="#network">HSR Layout</a>
            <a href="#faq">FAQ</a>
          </div>
          <div>
            <span className="mono footer-k">CONTACT</span>
            <a href="mailto:hello@binwala.com">hello@binwala.com</a>
            <a href="#join">Join the waitlist</a>
          </div>
        </div>
      </div>
      <div className="footer-word" aria-hidden="true">
        binwala
      </div>
      <div className="footer-bottom mono">
        <span>© {new Date().getFullYear()} BINWALA · MADE IN BENGALURU</span>
        <span>
          City waste estimate:{" "}
          <a href="https://bpac.in/navigating-solid-waste-challenge-in-bengaluru/" target="_blank" rel="noreferrer">
            B.PAC
          </a>
          . Concept screens and city visualisation are illustrative.
        </span>
        <span>BUILD 0.1 · BLR</span>
      </div>
    </footer>
  );
}
