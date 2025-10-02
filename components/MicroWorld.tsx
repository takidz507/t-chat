
import React, { useState } from 'react';
import { PlusIcon } from './Icons';

// In a real implementation, this state would be synced over WebRTC
// and encrypted with the group's shared key. This is a UI mockup.

interface Card {
  id: string;
  content: string;
  position: { x: number; y: number };
}

const MicroWorld: React.FC = () => {
  const [cards, setCards] = useState<Card[]>([
    { id: '1', content: 'Brainstorm Idea 1', position: { x: 20, y: 20 } },
    { id: '2', content: 'User Story', position: { x: 150, y: 80 } },
  ]);
  const [draggingCard, setDraggingCard] = useState<{ id: string; offset: { x: number; y: number } } | null>(null);

  const addCard = () => {
    const newCard: Card = {
      id: crypto.randomUUID(),
      content: 'New Card',
      position: { x: Math.random() * 100, y: Math.random() * 100 },
    };
    // TODO: Broadcast new card event to peers
    setCards([...cards, newCard]);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, id: string) => {
    const cardElement = e.currentTarget;
    const rect = cardElement.getBoundingClientRect();
    const offset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setDraggingCard({ id, offset });
    cardElement.style.cursor = 'grabbing';
    cardElement.style.zIndex = '10';
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingCard) return;

    const parentRect = e.currentTarget.getBoundingClientRect();
    const newX = e.clientX - parentRect.left - draggingCard.offset.x;
    const newY = e.clientY - parentRect.top - draggingCard.offset.y;

    setCards(currentCards =>
      currentCards.map(card =>
        card.id === draggingCard.id ? { ...card, position: { x: newX, y: newY } } : card
      )
    );
  };
  
  const handleMouseUp = () => {
      // TODO: Broadcast final card position update to peers
      if (draggingCard) {
        const cardElement = document.getElementById(`card-${draggingCard.id}`);
        if(cardElement) {
            cardElement.style.cursor = 'grab';
            cardElement.style.zIndex = 'auto';
        }
      }
    setDraggingCard(null);
  };


  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900/50">
      <header className="p-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h3 className="font-semibold text-sm">Shared Micro-World</h3>
        <button onClick={addCard} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          <PlusIcon className="w-5 h-5" />
        </button>
      </header>
      <div 
        className="flex-1 relative overflow-hidden" 
        onMouseMove={handleMouseMove} 
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <p className="absolute top-2 left-2 text-xs text-gray-400">This is a demo space. State is not synced.</p>
        {cards.map(card => (
          <div
            id={`card-${card.id}`}
            key={card.id}
            className="absolute p-2 bg-yellow-200 dark:bg-yellow-700 rounded-md shadow-md text-sm text-gray-800 dark:text-gray-200 cursor-grab"
            style={{ left: card.position.x, top: card.position.y }}
            onMouseDown={(e) => handleMouseDown(e, card.id)}
          >
            {card.content}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MicroWorld;
   